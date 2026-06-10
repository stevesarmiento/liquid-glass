use serde::{Deserialize, Serialize};

use crate::lens::{normalize_lens_params, PartialLensParams};
use crate::map::{
    compute_dome_constants, dome_gradient, erf_approx, rounded_rect_sdf, DisplacementMap,
};

const MAX_LENSES: usize = 4;
const EDGE_RANGE: f32 = 3.0;
const GRADIENT_EPS: f32 = 0.5;

/// Half-range in region px of the signed-distance band encoded in the merged
/// map's alpha channel.
///
/// - encode: alpha = clamp(0.5 - d / (2 * MERGED_ALPHA_DISTANCE_RANGE), 0, 1)
/// - decode (renderer side): d = (0.5 - alpha) * (2 * MERGED_ALPHA_DISTANCE_RANGE)
///
/// Alpha is 255 at d <= -MERGED_ALPHA_DISTANCE_RANGE (deep inside), 128/127
/// straddle the surface (d = 0), and 0 at d >= +MERGED_ALPHA_DISTANCE_RANGE.
///
/// 40px (≈0.31px per alpha step) leaves enough outward band for the shader's
/// drop shadow (offset + blur are capped to this range on the TS side) while
/// keeping the quantization error well under the renderers' ~1px AA.
pub const MERGED_ALPHA_DISTANCE_RANGE: f32 = 40.0;

/// One lens shape in region px coordinates (x/y are the lens center).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedLensShape {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub radius: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedMapInput {
    pub region_width: f32,
    pub region_height: f32,
    /// 1-4 lens shapes, in region coordinates (extras beyond 4 are ignored).
    pub lenses: Vec<MergedLensShape>,
    /// Smooth-union blend distance k in px (0 = hard union).
    pub blend: f32,
    /// Shared optical params; width/height/radius/splay are ignored.
    #[serde(default)]
    pub lens: PartialLensParams,
}

/// Polynomial smooth-min. With k <= 0 this degrades to a hard `min(a, b)`.
/// Folded left-to-right over the lens list to build the merged SDF.
pub fn smooth_min(a: f32, b: f32, k: f32) -> f32 {
    if k <= 0.0 {
        return a.min(b);
    }
    let h = (0.5 + (0.5 * (b - a)) / k).clamp(0.0, 1.0);
    b * (1.0 - h) + a * h - k * h * (1.0 - h)
}

/// Generates a multi-lens "liquid blend" (metaball) displacement map.
///
/// Port of the TypeScript `generateMergedDisplacementMap` in
/// `packages/liquid-glass/src/engine/merged.ts`. Float operations follow the
/// same order so output bytes stay within the ±1 LSB parity contract.
///
/// Panics if `input.lenses` is empty (the wasm boundary guards this and
/// returns an Err instead).
pub fn generate_merged_displacement_map(input: &MergedMapInput) -> DisplacementMap {
    assert!(
        !input.lenses.is_empty(),
        "generate_merged_displacement_map requires at least one lens"
    );
    let lenses = &input.lenses[..input.lenses.len().min(MAX_LENSES)];
    let params = normalize_lens_params(input.lens);
    let region_width = input.region_width.max(1.0);
    let region_height = input.region_height.max(1.0);
    let blend = input.blend.max(0.0);
    let map_size = params.map_size;

    let (map_w, map_h) = if region_width >= region_height {
        let h = ((map_size as f64) * (region_height as f64) / (region_width as f64)).round();
        (map_size, (h as u32).max(8))
    } else {
        let w = ((map_size as f64) * (region_width as f64) / (region_height as f64)).round();
        ((w as u32).max(8), map_size)
    };

    let count = lenses.len();
    let mut cx = vec![0.0_f32; count];
    let mut cy = vec![0.0_f32; count];
    let mut hw = vec![0.0_f32; count];
    let mut hh = vec![0.0_f32; count];
    let mut rad = vec![0.0_f32; count];
    let mut r_ref = 0.0_f32;
    for (i, lens) in lenses.iter().enumerate() {
        cx[i] = lens.x;
        cy[i] = lens.y;
        hw[i] = (lens.width / 2.0).max(0.5);
        hh[i] = (lens.height / 2.0).max(0.5);
        rad[i] = lens.radius.clamp(0.0, hw[i].min(hh[i]));
        r_ref = r_ref.max(hw[i].min(hh[i]));
    }

    let depth = params.depth;
    let inv_sigma = if depth > 0.0 {
        1.0 / (depth * std::f32::consts::SQRT_2)
    } else {
        1_000_000.0
    };
    let dome = if params.dome > 0.0 {
        Some(compute_dome_constants(params.dome, r_ref, r_ref))
    } else {
        None
    };
    let glow_threshold = (1.0 - params.glow_spread) * std::f32::consts::SQRT_2;
    let glow_range = params.glow_spread * std::f32::consts::SQRT_2;
    let spec_rotation = (params.specular_rotation * std::f32::consts::PI) / 180.0;
    let spec_x = spec_rotation.cos();
    let spec_y = spec_rotation.sin();

    // Overlap-aware blend attenuation (anti-bloat). The polynomial smooth-min
    // inflates the union by up to k/4 wherever both surfaces are within k, so
    // the merged blob visibly swells once lenses overlap. Attenuate k for each
    // fold step by how deeply lens i overlaps the lenses before it:
    //   gap >= 0 (approaching/touching) -> full blend (liquid neck),
    //   gap <= -er_min (fully swallowed) -> 0 (plain min, no bloat).
    // Effective radii use the clamped half-extents, i.e. min(width, height) / 2
    // with the same 0.5px floor as hw/hh, which also keeps er_min > 0. Computed
    // once per map and reused inside the central-difference gradient samples.
    let mut er = vec![0.0_f32; count];
    for i in 0..count {
        er[i] = hw[i].min(hh[i]);
    }
    let mut k_eff = vec![0.0_f32; count];
    for i in 1..count {
        let mut gap = f32::INFINITY;
        let mut er_min = er[i];
        for j in 0..i {
            let dx = cx[i] - cx[j];
            let dy = cy[i] - cy[j];
            let g = (dx * dx + dy * dy).sqrt() - er[i] - er[j];
            if g < gap {
                gap = g;
            }
            if er[j] < er_min {
                er_min = er[j];
            }
        }
        k_eff[i] = blend * (1.0 + gap / er_min).clamp(0.0, 1.0);
    }

    let merged_sdf = |sx: f32, sy: f32| -> f32 {
        let mut d = rounded_rect_sdf(sx - cx[0], sy - cy[0], hw[0], hh[0], rad[0]);
        for i in 1..count {
            let di = rounded_rect_sdf(sx - cx[i], sy - cy[i], hw[i], hh[i], rad[i]);
            d = smooth_min(d, di, k_eff[i]);
        }
        d
    };

    let mut rgba = vec![0_u8; (map_w * map_h * 4) as usize];

    for py in 0..map_h {
        let sy = (((py as f32) + 0.5) * region_height) / (map_h as f32);
        for px in 0..map_w {
            let sx = (((px as f32) + 0.5) * region_width) / (map_w as f32);
            let d = merged_sdf(sx, sy);
            let alpha = ((0.5 - d / (2.0 * MERGED_ALPHA_DISTANCE_RANGE)).clamp(0.0, 1.0) * 255.0)
                .round() as u8;
            let index = ((py * map_w + px) * 4) as usize;

            // Outside the blob only alpha carries information (the signed-
            // distance band extends to d < +MERGED_ALPHA_DISTANCE_RANGE);
            // displacement and specular stay neutral, so skip the
            // gradient/spec work entirely.
            if d >= 0.0 {
                rgba[index] = 128;
                rgba[index + 1] = 128;
                rgba[index + 2] = 128;
                rgba[index + 3] = alpha;
                continue;
            }

            // Outward-pointing gradient of the merged SDF via central differences.
            let mut gx = (merged_sdf(sx + GRADIENT_EPS, sy) - merged_sdf(sx - GRADIENT_EPS, sy))
                / (2.0 * GRADIENT_EPS);
            let mut gy = (merged_sdf(sx, sy + GRADIENT_EPS) - merged_sdf(sx, sy - GRADIENT_EPS))
                / (2.0 * GRADIENT_EPS);
            let grad_length = gx.hypot(gy);
            if grad_length < 1e-6 {
                gx = 0.0;
                gy = 0.0;
            } else {
                gx /= grad_length;
                gy /= grad_length;
            }

            let e = (-d).max(0.0);
            let x_equiv = (r_ref - e).clamp(0.0, r_ref);
            let mut m = if let Some(dome) = dome {
                dome_gradient(x_equiv, dome.rx, dome.scale_x)
            } else {
                x_equiv / r_ref
            };
            m = m.clamp(0.0, 1.5);

            // For a lone circle the inset SDF equals d + depth exactly, matching
            // the single-lens falloff behavior.
            let falloff = 0.5 * (1.0 + erf_approx((d + depth) * inv_sigma));

            let disp_x = (gx * m * falloff).clamp(-1.0, 1.0);
            let disp_y = (gy * m * falloff).clamp(-1.0, 1.0);
            let r = ((0.5 - 0.5 * disp_x) * 255.0).round() as u8;
            let g = ((0.5 - 0.5 * disp_y) * 255.0).round() as u8;

            // Specular: pseudo-normalized coords from the gradient scaled by the
            // rim proximity. For a lone circle this equals the single-lens
            // normalized coords at the rim.
            let p = (1.0 - e / r_ref).clamp(0.0, 1.0);
            let nx = gx * p;
            let ny = gy * p;
            let highlight_axis = (nx * spec_x + ny * spec_y).abs();
            let edge_mask = if d < 0.0 {
                (1.0 + d / EDGE_RANGE).max(0.0)
            } else {
                0.0
            };
            let mut spec = 0.0_f32;
            if params.glow > 0.0 {
                let t = ((highlight_axis - glow_threshold) / glow_range).clamp(0.0, 1.0);
                spec += params.glow * t.powf(params.glow_exponent) * falloff;
            }
            if params.edge > 0.0 {
                spec += params.edge * edge_mask * highlight_axis.powf(params.edge_exponent);
            }
            let b = (128.0 + 127.0 * spec.min(1.0)).round() as u8;

            rgba[index] = r;
            rgba[index + 1] = g;
            rgba[index + 2] = b;
            rgba[index + 3] = alpha;
        }
    }

    DisplacementMap {
        width: map_w,
        height: map_h,
        rgba,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lens::LensParams;
    use crate::map::generate_displacement_map;

    fn circle(x: f32, y: f32, r: f32) -> MergedLensShape {
        MergedLensShape {
            x,
            y,
            width: 2.0 * r,
            height: 2.0 * r,
            radius: r,
        }
    }

    fn optics() -> PartialLensParams {
        PartialLensParams {
            depth: Some(10.0),
            dome: Some(0.0),
            splay: Some(1.0),
            glow: Some(0.45),
            edge: Some(0.45),
            blur: Some(0.0),
            map_size: Some(64),
            ..PartialLensParams::default()
        }
    }

    /// Reads the RGBA bytes of the map texel containing region point (x, y).
    fn sample_at(
        map: &DisplacementMap,
        region_width: f32,
        region_height: f32,
        x: f32,
        y: f32,
    ) -> [u8; 4] {
        let px = (((x / region_width) * (map.width as f32)).floor() as u32).min(map.width - 1);
        let py = (((y / region_height) * (map.height as f32)).floor() as u32).min(map.height - 1);
        let index = ((py * map.width + px) * 4) as usize;
        [
            map.rgba[index],
            map.rgba[index + 1],
            map.rgba[index + 2],
            map.rgba[index + 3],
        ]
    }

    #[test]
    fn merged_map_is_deterministic() {
        let input = MergedMapInput {
            region_width: 300.0,
            region_height: 200.0,
            lenses: vec![circle(90.0, 100.0, 40.0), circle(210.0, 100.0, 50.0)],
            blend: 24.0,
            lens: optics(),
        };

        let first = generate_merged_displacement_map(&input);
        let second = generate_merged_displacement_map(&input);
        assert_eq!(first, second);
    }

    /// Region-space center of the map texel containing region point (x, y).
    fn texel_center(
        map: &DisplacementMap,
        region_width: f32,
        region_height: f32,
        x: f32,
        y: f32,
    ) -> (f32, f32) {
        let px = (((x / region_width) * (map.width as f32)).floor() as u32).min(map.width - 1);
        let py = (((y / region_height) * (map.height as f32)).floor() as u32).min(map.height - 1);
        (
            (((px as f32) + 0.5) * region_width) / (map.width as f32),
            (((py as f32) + 0.5) * region_height) / (map.height as f32),
        )
    }

    /// Decodes a merged-map alpha byte back to signed distance in region px.
    fn decode_alpha(alpha_byte: u8) -> f32 {
        (0.5 - (alpha_byte as f32) / 255.0) * (2.0 * MERGED_ALPHA_DISTANCE_RANGE)
    }

    #[test]
    fn alpha_is_zero_far_outside_and_full_deep_inside() {
        let map = generate_merged_displacement_map(&MergedMapInput {
            region_width: 200.0,
            region_height: 200.0,
            lenses: vec![circle(100.0, 100.0, 50.0)],
            blend: 0.0,
            lens: optics(),
        });

        // (6, 6) is ~84px outside the circle, beyond +MERGED_ALPHA_DISTANCE_RANGE.
        let outside = sample_at(&map, 200.0, 200.0, 6.0, 6.0);
        assert_eq!(outside, [128, 128, 128, 0]);

        // The center is 50px deep, beyond -MERGED_ALPHA_DISTANCE_RANGE.
        let inside = sample_at(&map, 200.0, 200.0, 100.0, 100.0);
        assert_eq!(inside[3], 255);

        // Inside but shallower than the band: alpha already < 255.
        let shallow = sample_at(&map, 200.0, 200.0, 100.0 + 50.0 - 10.0, 100.0);
        assert!(shallow[3] > 127);
        assert!(shallow[3] < 255);

        // Outside but inside the band: alpha still > 0, RGB neutral.
        let near = sample_at(&map, 200.0, 200.0, 100.0 + 50.0 + 10.0, 100.0);
        assert!(near[3] > 0);
        assert!(near[3] < 128);
        assert_eq!(&near[..3], &[128, 128, 128]);
    }

    #[test]
    fn alpha_band_is_monotonic_across_the_edge_along_a_ray() {
        let region = 200.0_f32;
        let map = generate_merged_displacement_map(&MergedMapInput {
            region_width: region,
            region_height: region,
            lenses: vec![circle(100.0, 100.0, 50.0)],
            blend: 0.0,
            lens: PartialLensParams {
                map_size: Some(128),
                ..optics()
            },
        });

        // Walk the horizontal mid-row outward from the circle center: alpha
        // must be non-increasing the whole way (255 plateau, band, 0 plateau).
        let py = (((100.0 / region) * (map.height as f32)).floor() as u32).min(map.height - 1);
        let start_px = ((100.0 / region) * (map.width as f32)).floor() as u32;
        let mut previous = map.rgba[((py * map.width + start_px) * 4 + 3) as usize];
        let mut band_samples = 0;
        for px in (start_px + 1)..map.width {
            let alpha = map.rgba[((py * map.width + px) * 4 + 3) as usize];
            assert!(alpha <= previous, "alpha rose outward at px {px}");
            if alpha > 0 && alpha < 255 {
                band_samples += 1;
            }
            previous = alpha;
        }
        assert!(band_samples > 3);
        assert_eq!(previous, 0);
    }

    #[test]
    fn alpha_round_trips_distance_near_the_edge() {
        let region = 200.0_f32;
        let radius = 50.0_f32;
        let map = generate_merged_displacement_map(&MergedMapInput {
            region_width: region,
            region_height: region,
            lenses: vec![circle(100.0, 100.0, radius)],
            blend: 0.0,
            lens: PartialLensParams {
                map_size: Some(128),
                ..optics()
            },
        });

        // Probe ~10px outside the circle edge along the +x axis. Compare the
        // decoded distance against the analytic SDF at the sampled texel.
        let probe_x = 100.0 + radius + 10.0;
        let probe_y = 100.0;
        let (sx, sy) = texel_center(&map, region, region, probe_x, probe_y);
        let analytic =
            ((sx - 100.0) * (sx - 100.0) + (sy - 100.0) * (sy - 100.0)).sqrt() - radius;
        assert!(analytic > 8.0 && analytic < 12.0);

        let alpha = sample_at(&map, region, region, probe_x, probe_y)[3];
        assert!((decode_alpha(alpha) - analytic).abs() <= 1.0);
    }

    #[test]
    fn bridge_appears_between_near_circles_when_blend_is_large() {
        // Centers 150 and 250, radius 40: edge gap = 20px. The polynomial
        // smooth-min dips the midpoint SDF by k/4, so blend 60 pulls the
        // midpoint (d = gap/2 = 10 per circle) inside: 10 - 60/4 = -5.
        let lenses = vec![circle(150.0, 80.0, 40.0), circle(250.0, 80.0, 40.0)];
        let lens = PartialLensParams {
            map_size: Some(128),
            ..optics()
        };

        let hard = generate_merged_displacement_map(&MergedMapInput {
            region_width: 400.0,
            region_height: 160.0,
            lenses: lenses.clone(),
            blend: 0.0,
            lens,
        });
        // d = +10 at the midpoint: outside (alpha < 128) but within the band.
        assert!(sample_at(&hard, 400.0, 160.0, 200.0, 80.0)[3] < 128);

        let blended = generate_merged_displacement_map(&MergedMapInput {
            region_width: 400.0,
            region_height: 160.0,
            lenses,
            blend: 60.0,
            lens,
        });
        assert!(sample_at(&blended, 400.0, 160.0, 200.0, 80.0)[3] > 127);
    }

    #[test]
    fn bridge_while_approaching_but_no_bloat_when_overlapped() {
        let lens = PartialLensParams {
            map_size: Some(128),
            ..optics()
        };

        // (a) Approaching: radius 50, edge gap 20 (gap >= 0 -> full blend).
        // The smooth-min dips the midpoint by ~k/4, bridging the gap.
        let approaching = generate_merged_displacement_map(&MergedMapInput {
            region_width: 300.0,
            region_height: 200.0,
            lenses: vec![circle(90.0, 100.0, 50.0), circle(210.0, 100.0, 50.0)],
            blend: 60.0,
            lens,
        });
        assert!(sample_at(&approaching, 300.0, 200.0, 150.0, 100.0)[3] > 127);

        // (b) Heavily overlapped: centers 30px apart (gap = -70 <= -er_min =
        // -50, attenuation 0 -> plain union). Probe just above the top of the
        // upper circle: the plain union leaves it outside, while the
        // unattenuated smooth-min would have bloated past it.
        let (c0x, c0y, c0r) = (100.0_f32, 85.0_f32, 50.0_f32);
        let (c1x, c1y, c1r) = (100.0_f32, 115.0_f32, 50.0_f32);
        let overlapped = generate_merged_displacement_map(&MergedMapInput {
            region_width: 200.0,
            region_height: 200.0,
            lenses: vec![circle(c0x, c0y, c0r), circle(c1x, c1y, c1r)],
            blend: 60.0,
            lens,
        });

        let probe_y = c0y - c0r - 1.5; // just outside the union's top extent
        let (sx, sy) = texel_center(&overlapped, 200.0, 200.0, c0x, probe_y);
        let d0 = ((sx - c0x) * (sx - c0x) + (sy - c0y) * (sy - c0y)).sqrt() - c0r;
        let d1 = ((sx - c1x) * (sx - c1x) + (sy - c1y) * (sy - c1y)).sqrt() - c1r;
        // Sanity: outside both circles, but the raw (unattenuated) smooth-min
        // would pull the point inside -- the bloat this change removes.
        assert!(d0.min(d1) > 0.0);
        assert!(smooth_min(d0, d1, 60.0) < 0.0);

        let alpha = sample_at(&overlapped, 200.0, 200.0, c0x, probe_y)[3];
        assert!(alpha < 127, "expected outside, got alpha {alpha}");
        assert!(decode_alpha(alpha) > 0.0);
    }

    #[test]
    fn concentric_circles_match_a_single_circle_map() {
        let lens = PartialLensParams {
            map_size: Some(128),
            ..optics()
        };
        let concentric = generate_merged_displacement_map(&MergedMapInput {
            region_width: 200.0,
            region_height: 200.0,
            lenses: vec![circle(100.0, 100.0, 50.0), circle(100.0, 100.0, 50.0)],
            blend: 60.0,
            lens,
        });
        let single = generate_merged_displacement_map(&MergedMapInput {
            region_width: 200.0,
            region_height: 200.0,
            lenses: vec![circle(100.0, 100.0, 50.0)],
            blend: 60.0,
            lens,
        });
        assert_eq!(concentric, single);
    }

    #[test]
    fn non_square_regions_scale_the_short_side() {
        let wide = generate_merged_displacement_map(&MergedMapInput {
            region_width: 400.0,
            region_height: 200.0,
            lenses: vec![circle(100.0, 100.0, 40.0)],
            blend: 0.0,
            lens: optics(),
        });
        assert_eq!(wide.width, 64);
        assert_eq!(wide.height, 32);
        assert_eq!(wide.rgba.len(), 64 * 32 * 4);

        let tall = generate_merged_displacement_map(&MergedMapInput {
            region_width: 100.0,
            region_height: 300.0,
            lenses: vec![circle(50.0, 100.0, 30.0)],
            blend: 0.0,
            lens: optics(),
        });
        assert_eq!(tall.width, 21); // max(8, round(64 * 100 / 300))
        assert_eq!(tall.height, 64);
        assert_eq!(tall.rgba.len(), 21 * 64 * 4);
    }

    #[test]
    fn lone_circle_displacement_signs_match_single_lens_generator() {
        let size = 120.0_f32;
        // Larger depth keeps interior displacements well away from the neutral
        // 128 rounding boundary so sign comparisons are robust.
        let single = generate_displacement_map(&normalize_lens_params(PartialLensParams {
            width: Some(size),
            height: Some(size),
            radius: Some(size / 2.0),
            depth: Some(30.0),
            dome: Some(0.0),
            splay: Some(1.0),
            glow: Some(0.0),
            edge: Some(0.0),
            map_size: Some(64),
            ..PartialLensParams::default()
        }));
        let merged = generate_merged_displacement_map(&MergedMapInput {
            region_width: size,
            region_height: size,
            lenses: vec![circle(size / 2.0, size / 2.0, size / 2.0)],
            blend: 0.0,
            lens: PartialLensParams {
                depth: Some(30.0),
                dome: Some(0.0),
                splay: Some(1.0),
                glow: Some(0.0),
                edge: Some(0.0),
                map_size: Some(64),
                ..PartialLensParams::default()
            },
        });
        assert_eq!(merged.width, single.width);
        assert_eq!(merged.height, single.height);

        let samples = [
            (size * 0.25, size * 0.5),
            (size * 0.75, size * 0.5),
            (size * 0.5, size * 0.25),
            (size * 0.5, size * 0.75),
            (size * 0.35, size * 0.35),
            (size * 0.65, size * 0.65),
        ];
        for (x, y) in samples {
            let s = sample_at(&single, size, size, x, y);
            let m = sample_at(&merged, size, size, x, y);
            // Exact bytes differ (different magnitude model) but signs agree.
            let sign = |byte: u8| -> i32 { (byte as i32 - 128).signum() };
            assert_eq!(sign(m[0]), sign(s[0]), "R sign at ({x}, {y})");
            assert_eq!(sign(m[1]), sign(s[1]), "G sign at ({x}, {y})");
        }

        // Single-lens convention: left-of-center is R > 128, right is R < 128.
        let left = sample_at(&merged, size, size, size * 0.25, size * 0.5);
        let right = sample_at(&merged, size, size, size * 0.75, size * 0.5);
        assert!(left[0] > 128);
        assert!(right[0] < 128);
    }

    #[test]
    fn extra_lenses_beyond_four_are_ignored() {
        let four = MergedMapInput {
            region_width: 300.0,
            region_height: 120.0,
            lenses: vec![
                circle(50.0, 60.0, 25.0),
                circle(120.0, 60.0, 25.0),
                circle(190.0, 60.0, 25.0),
                circle(260.0, 60.0, 25.0),
            ],
            blend: 12.0,
            lens: optics(),
        };
        let mut five = four.clone();
        five.lenses.push(circle(150.0, 60.0, 50.0));

        assert_eq!(
            generate_merged_displacement_map(&four),
            generate_merged_displacement_map(&five)
        );
    }

    #[test]
    #[should_panic(expected = "at least one lens")]
    fn empty_lenses_panic_with_clear_message() {
        let _ = generate_merged_displacement_map(&MergedMapInput {
            region_width: 100.0,
            region_height: 100.0,
            lenses: vec![],
            blend: 0.0,
            lens: optics(),
        });
    }
}
