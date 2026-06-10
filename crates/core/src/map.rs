use serde::{Deserialize, Serialize};

use crate::lens::LensParams;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplacementMap {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct DomeConstants {
    pub(crate) rx: f32,
    pub(crate) ry: f32,
    pub(crate) scale_x: f32,
    pub(crate) scale_y: f32,
}

pub fn generate_displacement_map(params: &LensParams) -> DisplacementMap {
    let size = params.map_size.max(1);
    let half_w = params.width / 2.0;
    let half_h = params.height / 2.0;
    let radius = params.radius.min(half_w).min(half_h);
    let depth = params.depth.max(0.0);
    let inner_half_w = (half_w - depth).max(0.0);
    let inner_half_h = (half_h - depth).max(0.0);
    let inner_radius = radius.min(inner_half_w).min(inner_half_h).max(0.0);
    let inv_sigma = if depth > 0.0 {
        1.0 / (depth * std::f32::consts::SQRT_2)
    } else {
        1_000_000.0
    };
    let dome = if params.dome > 0.0 {
        Some(compute_dome_constants(params.dome, half_w, half_h))
    } else {
        None
    };
    let splay = params.splay.max(0.001);
    let splay_active = splay < 0.999;
    let edge_range = 3.0_f32;
    let glow_threshold = (1.0 - params.glow_spread) * std::f32::consts::SQRT_2;
    let glow_range = params.glow_spread * std::f32::consts::SQRT_2;
    let spec_rotation = params.specular_rotation.to_radians();
    let spec_x = spec_rotation.cos();
    let spec_y = spec_rotation.sin();
    let min_half = half_w.min(half_h).max(1.0);
    let mut rgba = vec![0; (size * size * 4) as usize];
    let half_size = (size + 1) / 2;

    // Blue/specular is NOT invariant under single-axis mirroring, so it is
    // evaluated per mirrored pixel from that pixel's own normalized coords.
    let spec_byte = |nx: f32, ny: f32, falloff: f32, edge_mask: f32| -> u8 {
        let highlight_axis = (nx * spec_x + ny * spec_y).abs();
        let mut spec = 0.0;
        if params.glow > 0.0 {
            let t = ((highlight_axis - glow_threshold) / glow_range).clamp(0.0, 1.0);
            spec += params.glow * t.powf(params.glow_exponent) * falloff;
        }
        if params.edge > 0.0 {
            spec += params.edge * edge_mask * highlight_axis.powf(params.edge_exponent);
        }
        (128.0 + 127.0 * spec.min(1.0)).round() as u8
    };

    for py in 0..half_size {
        let y = (((py as f32) + 0.5) / (size as f32)) * (2.0 * half_h) - half_h;
        let gy_base = if let Some(dome) = dome {
            y.signum() * dome_gradient(y.abs(), dome.ry, dome.scale_y)
        } else {
            (y / half_h).clamp(-1.0, 1.0)
        };
        let edge_y = if splay_active {
            (1.0 - (half_h - y.abs()) / min_half).max(0.0) * (1.0 - splay)
        } else {
            0.0
        };
        let base_ny = (y / half_h).clamp(-1.0, 1.0);

        for px in 0..half_size {
            let x = (((px as f32) + 0.5) / (size as f32)) * (2.0 * half_w) - half_w;
            let outer = rounded_rect_sdf(x, y, half_w, half_h, radius);

            if outer >= 0.0 {
                write_symmetric_pixels(&mut rgba, size, px, py, 128, 128, [128; 4], true);
                continue;
            }

            let mut gx = if let Some(dome) = dome {
                x.signum() * dome_gradient(x.abs(), dome.rx, dome.scale_x)
            } else {
                (x / half_w).clamp(-1.0, 1.0)
            };
            let mut gy = gy_base;

            if splay_active {
                let edge_x = (1.0 - (half_w - x.abs()) / min_half).max(0.0) * (1.0 - splay);
                let original_length = gx.hypot(gy);
                gx *= 1.0 - edge_y;
                gy *= 1.0 - edge_x;
                let next_length = gx.hypot(gy);
                if next_length > 0.001 {
                    gx *= original_length / next_length;
                    gy *= original_length / next_length;
                }
            }

            let inner = rounded_rect_sdf(x, y, inner_half_w, inner_half_h, inner_radius);
            let falloff = 0.5 * (1.0 + erf_approx(inner * inv_sigma));
            let r = ((0.5 - 0.5 * gx * falloff) * 255.0).round();
            let g = ((0.5 - 0.5 * gy * falloff) * 255.0).round();
            let base_nx = (x / half_w).clamp(-1.0, 1.0);
            let edge_mask = if outer < 0.0 {
                (1.0 + outer / edge_range).max(0.0)
            } else {
                0.0
            };
            // Per-quadrant blue: [computed, mirrored-x, mirrored-y, mirrored-xy].
            let b = [
                spec_byte(base_nx, base_ny, falloff, edge_mask),
                spec_byte(-base_nx, base_ny, falloff, edge_mask),
                spec_byte(base_nx, -base_ny, falloff, edge_mask),
                spec_byte(-base_nx, -base_ny, falloff, edge_mask),
            ];

            write_symmetric_pixels(
                &mut rgba,
                size,
                px,
                py,
                clamp_byte(r),
                clamp_byte(g),
                b,
                false,
            );
        }
    }

    DisplacementMap {
        width: size,
        height: size,
        rgba,
    }
}

pub(crate) fn erf_approx(x: f32) -> f32 {
    (1.7724538509 * x).tanh()
}

fn integrate_dome(radius: f32, half: f32) -> f32 {
    let mut sum = 0.0;
    for i in 0..=200 {
        let x = (i as f32 / 200.0) * half;
        let slope = x / (radius * radius - x * x).sqrt();
        sum += if i == 0 || i == 200 { 0.5 } else { 1.0 } * slope;
    }
    sum / 200.0
}

pub(crate) fn compute_dome_constants(depth: f32, half_w: f32, half_h: f32) -> DomeConstants {
    let safe_depth = depth.clamp(0.01, (half_w.min(half_h) - 1.0).max(0.01));
    let rx = (half_w * half_w + safe_depth * safe_depth) / (2.0 * safe_depth);
    let ry = (half_h * half_h + safe_depth * safe_depth) / (2.0 * safe_depth);
    let ix = integrate_dome(rx, half_w);
    let iy = integrate_dome(ry, half_h);

    DomeConstants {
        rx,
        ry,
        scale_x: if ix > 0.0 { 0.5 / ix } else { 1.0 },
        scale_y: if iy > 0.0 { 0.5 / iy } else { 1.0 },
    }
}

pub(crate) fn dome_gradient(value: f32, radius: f32, scale: f32) -> f32 {
    let x = value.min(0.999 * radius);
    (x / (radius * radius - x * x).sqrt()) * scale
}

pub(crate) fn rounded_rect_sdf(x: f32, y: f32, half_w: f32, half_h: f32, radius: f32) -> f32 {
    let qx = x.abs() - half_w + radius;
    let qy = y.abs() - half_h + radius;
    let ox = qx.max(0.0);
    let oy = qy.max(0.0);
    (ox * ox + oy * oy).sqrt() + qx.max(qy).min(0.0) - radius
}

fn write_symmetric_pixels(
    rgba: &mut [u8],
    size: u32,
    px: u32,
    py: u32,
    r: u8,
    g: u8,
    b: [u8; 4],
    neutral: bool,
) {
    let px_r = size - 1 - px;
    let py_b = size - 1 - py;
    write_pixel(rgba, size, px, py, r, g, b[0]);
    if px_r != px {
        write_pixel(
            rgba,
            size,
            px_r,
            py,
            if neutral { r } else { 255 - r },
            g,
            b[1],
        );
    }
    if py_b != py {
        write_pixel(
            rgba,
            size,
            px,
            py_b,
            r,
            if neutral { g } else { 255 - g },
            b[2],
        );
    }
    if px_r != px && py_b != py {
        write_pixel(
            rgba,
            size,
            px_r,
            py_b,
            if neutral { r } else { 255 - r },
            if neutral { g } else { 255 - g },
            b[3],
        );
    }
}

fn write_pixel(rgba: &mut [u8], size: u32, px: u32, py: u32, r: u8, g: u8, b: u8) {
    let index = ((py * size + px) * 4) as usize;
    rgba[index] = r;
    rgba[index + 1] = g;
    rgba[index + 2] = b;
    rgba[index + 3] = 255;
}

fn clamp_byte(value: f32) -> u8 {
    value.clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Brute-force reference: evaluates every pixel independently from its own
    /// coordinates, with no symmetry shortcuts. Must match the fast path
    /// byte-for-byte.
    fn reference_displacement_map(params: &LensParams) -> DisplacementMap {
        let size = params.map_size.max(1);
        let half_w = params.width / 2.0;
        let half_h = params.height / 2.0;
        let radius = params.radius.min(half_w).min(half_h);
        let depth = params.depth.max(0.0);
        let inner_half_w = (half_w - depth).max(0.0);
        let inner_half_h = (half_h - depth).max(0.0);
        let inner_radius = radius.min(inner_half_w).min(inner_half_h).max(0.0);
        let inv_sigma = if depth > 0.0 {
            1.0 / (depth * std::f32::consts::SQRT_2)
        } else {
            1_000_000.0
        };
        let dome = if params.dome > 0.0 {
            Some(compute_dome_constants(params.dome, half_w, half_h))
        } else {
            None
        };
        let splay = params.splay.max(0.001);
        let splay_active = splay < 0.999;
        let edge_range = 3.0_f32;
        let glow_threshold = (1.0 - params.glow_spread) * std::f32::consts::SQRT_2;
        let glow_range = params.glow_spread * std::f32::consts::SQRT_2;
        let spec_rotation = params.specular_rotation.to_radians();
        let spec_x = spec_rotation.cos();
        let spec_y = spec_rotation.sin();
        let min_half = half_w.min(half_h).max(1.0);
        let mut rgba = vec![0; (size * size * 4) as usize];

        for py in 0..size {
            let y = (((py as f32) + 0.5) / (size as f32)) * (2.0 * half_h) - half_h;
            for px in 0..size {
                let x = (((px as f32) + 0.5) / (size as f32)) * (2.0 * half_w) - half_w;
                let outer = rounded_rect_sdf(x, y, half_w, half_h, radius);

                if outer >= 0.0 {
                    write_pixel(&mut rgba, size, px, py, 128, 128, 128);
                    continue;
                }

                let (mut gx, mut gy) = if let Some(dome) = dome {
                    (
                        x.signum() * dome_gradient(x.abs(), dome.rx, dome.scale_x),
                        y.signum() * dome_gradient(y.abs(), dome.ry, dome.scale_y),
                    )
                } else {
                    ((x / half_w).clamp(-1.0, 1.0), (y / half_h).clamp(-1.0, 1.0))
                };

                if splay_active {
                    let edge_x = (1.0 - (half_w - x.abs()) / min_half).max(0.0) * (1.0 - splay);
                    let edge_y = (1.0 - (half_h - y.abs()) / min_half).max(0.0) * (1.0 - splay);
                    let original_length = gx.hypot(gy);
                    gx *= 1.0 - edge_y;
                    gy *= 1.0 - edge_x;
                    let next_length = gx.hypot(gy);
                    if next_length > 0.001 {
                        gx *= original_length / next_length;
                        gy *= original_length / next_length;
                    }
                }

                let inner = rounded_rect_sdf(x, y, inner_half_w, inner_half_h, inner_radius);
                let falloff = 0.5 * (1.0 + erf_approx(inner * inv_sigma));
                let r = ((0.5 - 0.5 * gx * falloff) * 255.0).round();
                let g = ((0.5 - 0.5 * gy * falloff) * 255.0).round();
                let base_nx = (x / half_w).clamp(-1.0, 1.0);
                let base_ny = (y / half_h).clamp(-1.0, 1.0);
                let highlight_axis = (base_nx * spec_x + base_ny * spec_y).abs();
                let mut spec = 0.0;

                if params.glow > 0.0 {
                    let t = ((highlight_axis - glow_threshold) / glow_range).clamp(0.0, 1.0);
                    spec += params.glow * t.powf(params.glow_exponent) * falloff;
                }
                if params.edge > 0.0 {
                    let edge_mask = if outer < 0.0 {
                        (1.0 + outer / edge_range).max(0.0)
                    } else {
                        0.0
                    };
                    spec += params.edge * edge_mask * highlight_axis.powf(params.edge_exponent);
                }

                write_pixel(
                    &mut rgba,
                    size,
                    px,
                    py,
                    clamp_byte(r),
                    clamp_byte(g),
                    (128.0 + 127.0 * spec.min(1.0)).round() as u8,
                );
            }
        }

        DisplacementMap {
            width: size,
            height: size,
            rgba,
        }
    }

    fn pixel(map: &DisplacementMap, x: u32, y: u32) -> [u8; 4] {
        let index = ((y * map.width + x) * 4) as usize;
        [
            map.rgba[index],
            map.rgba[index + 1],
            map.rgba[index + 2],
            map.rgba[index + 3],
        ]
    }

    #[test]
    fn rounded_rect_sdf_marks_inside_boundary_and_outside() {
        assert!(rounded_rect_sdf(0.0, 0.0, 50.0, 30.0, 10.0) < 0.0);
        assert!(rounded_rect_sdf(50.0, 0.0, 50.0, 30.0, 10.0).abs() < 0.001);
        assert!(rounded_rect_sdf(80.0, 0.0, 50.0, 30.0, 10.0) > 0.0);
    }

    #[test]
    fn displacement_map_has_expected_length() {
        let map = generate_displacement_map(&LensParams {
            map_size: 32,
            ..LensParams::default()
        });

        assert_eq!(map.rgba.len(), 32 * 32 * 4);
    }

    #[test]
    fn outside_pixels_are_neutral() {
        let map = generate_displacement_map(&LensParams {
            width: 100.0,
            height: 100.0,
            radius: 20.0,
            map_size: 32,
            ..LensParams::default()
        });

        assert_eq!(pixel(&map, 0, 0), [128, 128, 128, 255]);
    }

    #[test]
    fn map_uses_four_way_symmetry() {
        let map = generate_displacement_map(&LensParams {
            width: 100.0,
            height: 100.0,
            radius: 50.0,
            glow: 0.0,
            edge: 0.0,
            map_size: 32,
            ..LensParams::default()
        });
        let a = pixel(&map, 8, 8);
        let right = pixel(&map, 23, 8);
        let bottom = pixel(&map, 8, 23);
        let opposite = pixel(&map, 23, 23);

        assert_eq!(right[0], 255 - a[0]);
        assert_eq!(right[1], a[1]);
        assert_eq!(bottom[0], a[0]);
        assert_eq!(bottom[1], 255 - a[1]);
        assert_eq!(opposite[0], 255 - a[0]);
        assert_eq!(opposite[1], 255 - a[1]);
    }

    #[test]
    fn dome_mode_is_finite_and_deterministic() {
        let params = LensParams {
            dome: 80.0,
            map_size: 32,
            ..LensParams::default()
        };
        let first = generate_displacement_map(&params);
        let second = generate_displacement_map(&params);

        assert_eq!(first, second);
        assert_eq!(first.rgba.len(), (params.map_size * params.map_size * 4) as usize);
    }

    #[test]
    fn symmetric_fast_path_matches_brute_force_with_glow_and_edge() {
        let params = LensParams {
            glow: 1.0,
            edge: 1.0,
            map_size: 64,
            ..LensParams::default()
        };

        let fast = generate_displacement_map(&params);
        let reference = reference_displacement_map(&params);
        assert_eq!(fast, reference);
    }

    #[test]
    fn symmetric_fast_path_matches_brute_force_without_dome() {
        let params = LensParams {
            dome: 0.0,
            glow: 1.2,
            edge: 0.8,
            map_size: 32,
            ..LensParams::default()
        };

        assert_eq!(
            generate_displacement_map(&params),
            reference_displacement_map(&params)
        );
    }

    #[test]
    fn odd_map_size_matches_brute_force() {
        let params = LensParams {
            glow: 1.0,
            edge: 1.0,
            map_size: 33,
            ..LensParams::default()
        };

        let fast = generate_displacement_map(&params);
        assert_eq!(fast.rgba.len(), 33 * 33 * 4);
        assert_eq!(fast, reference_displacement_map(&params));
    }

    #[test]
    fn specular_highlight_is_not_mirrored_across_quadrants() {
        let map = generate_displacement_map(&LensParams {
            width: 100.0,
            height: 100.0,
            radius: 10.0,
            glow: 1.5,
            edge: 1.5,
            map_size: 64,
            ..LensParams::default()
        });

        // The 45-degree highlight lies on one diagonal only, so at least one
        // pixel must have a different blue value than its horizontal mirror.
        let mut differs = false;
        for y in 0..64u32 {
            for x in 0..32u32 {
                if pixel(&map, x, y)[2] != pixel(&map, 63 - x, y)[2] {
                    differs = true;
                }
            }
        }
        assert!(differs, "blue channel should break single-axis symmetry");
    }

    #[test]
    fn tiny_lens_dome_constants_stay_finite_and_positive() {
        for dimension in [1.0_f32, 2.0, 3.0] {
            let half = dimension / 2.0;
            let constants = compute_dome_constants(50.0, half, half);

            assert!(constants.rx.is_finite() && constants.rx > 0.0, "rx for {dimension}");
            assert!(constants.ry.is_finite() && constants.ry > 0.0, "ry for {dimension}");
            assert!(
                constants.scale_x.is_finite() && constants.scale_x > 0.0,
                "scale_x for {dimension}"
            );
            assert!(
                constants.scale_y.is_finite() && constants.scale_y > 0.0,
                "scale_y for {dimension}"
            );

            let map = generate_displacement_map(&LensParams {
                width: dimension,
                height: dimension,
                radius: half,
                depth: half,
                dome: 50.0,
                map_size: 8,
                ..LensParams::default()
            });
            assert_eq!(map.rgba.len(), 8 * 8 * 4);
        }
    }

    #[test]
    fn glow_and_edge_affect_blue_channel() {
        let off = generate_displacement_map(&LensParams {
            glow: 0.0,
            edge: 0.0,
            map_size: 64,
            ..LensParams::default()
        });
        let on = generate_displacement_map(&LensParams {
            glow: 1.0,
            edge: 1.0,
            map_size: 64,
            ..LensParams::default()
        });

        let max_off = off.rgba.chunks_exact(4).map(|p| p[2]).max().unwrap();
        let max_on = on.rgba.chunks_exact(4).map(|p| p[2]).max().unwrap();
        assert!(max_on > max_off);
    }
}
