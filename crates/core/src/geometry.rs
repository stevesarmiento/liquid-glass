use serde::{Deserialize, Serialize};

use crate::lens::LensParams;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PositionUnit {
    Normalized,
    Px,
}

impl Default for PositionUnit {
    fn default() -> Self {
        Self::Normalized
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RenderMode {
    Source,
    Target,
}

impl Default for RenderMode {
    fn default() -> Self {
        Self::Source
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeometryInput {
    pub container_width: f32,
    pub container_height: f32,
    pub x: f32,
    pub y: f32,
    #[serde(default)]
    pub unit: PositionUnit,
    #[serde(default)]
    pub mode: RenderMode,
    pub lens: LensParams,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LensGeometry {
    pub left: f32,
    pub top: f32,
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    pub filter_x: f32,
    pub filter_y: f32,
    pub filter_width: f32,
    pub filter_height: f32,
    pub bleed: u32,
}

pub fn compute_lens_geometry(input: GeometryInput) -> LensGeometry {
    let container_width = input.container_width.max(1.0);
    let container_height = input.container_height.max(1.0);
    let center_x = match input.unit {
        PositionUnit::Normalized => input.x * container_width,
        PositionUnit::Px => input.x,
    };
    let center_y = match input.unit {
        PositionUnit::Normalized => input.y * container_height,
        PositionUnit::Px => input.y,
    };
    let width = input.lens.width;
    let height = input.lens.height;
    let left = center_x - width * 0.5;
    let top = center_y - height * 0.5;
    let bleed = if input.mode == RenderMode::Target {
        // Quantized UP to 64px steps for the FILTER REGION only (kept in
        // lockstep with computeLensGeometry in ts-engine.ts): keeps the SVG
        // filter region stable across scale/blur drags so the browser's
        // rasterized filter inputs stay cached.
        target_bleed(&input.lens).div_ceil(64) * 64
    } else {
        0
    };
    let bleed_f = bleed as f32;
    let filter_x = if input.mode == RenderMode::Target {
        (left - bleed_f).max(0.0)
    } else {
        0.0
    };
    let filter_y = if input.mode == RenderMode::Target {
        (top - bleed_f).max(0.0)
    } else {
        0.0
    };
    let filter_right = if input.mode == RenderMode::Target {
        (left + width + bleed_f).min(container_width)
    } else {
        container_width
    };
    let filter_bottom = if input.mode == RenderMode::Target {
        (top + height + bleed_f).min(container_height)
    } else {
        container_height
    };

    LensGeometry {
        left,
        top,
        width,
        height,
        radius: input.lens.radius.min(width * 0.5).min(height * 0.5).max(0.0),
        filter_x,
        filter_y,
        filter_width: (filter_right - filter_x).max(0.0),
        filter_height: (filter_bottom - filter_y).max(0.0),
        bleed,
    }
}

pub fn color_matrix_for_scale(scale_x: f32, scale_y: f32) -> [f32; 20] {
    let base = scale_x.max(scale_y);
    let rx = if base > 0.0 { scale_x / base } else { 0.0 };
    let ry = if base > 0.0 { scale_y / base } else { 0.0 };

    [
        rx,
        0.0,
        0.0,
        0.0,
        0.5 * (1.0 - rx),
        0.0,
        ry,
        0.0,
        0.0,
        0.5 * (1.0 - ry),
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
    ]
}

pub fn target_bleed(params: &LensParams) -> u32 {
    // MAGNITUDE, not signed max: a negative scale demagnifies, sampling
    // OUTWARD past the lens edge, so it needs the same bleed as its positive
    // twin. Using the signed max made `-180` yield a negative value that
    // saturated to 0 on the u32 cast, collapsing the filter region onto the
    // lens box — outward samples then landed outside the region and rendered
    // transparent (the backdrop showed through at the rim).
    // Keep in sync with `targetBleed` in src/engine/ts-engine.ts.
    (params.scale_x.abs().max(params.scale_y.abs()) * (1.0 + 0.2 * params.chroma)
        + params.blur * 3.0
        + 4.0)
        .ceil() as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lens::LensParams;

    #[test]
    fn target_bleed_covers_three_sigma_blur() {
        let lens = LensParams {
            scale_x: 20.0,
            scale_y: 10.0,
            chroma: 0.5,
            blur: 2.1,
            ..LensParams::default()
        };

        // 20 * 1.1 + 2.1 * 3 + 4 = 32.3 -> 33
        assert_eq!(target_bleed(&lens), 33);
    }

    #[test]
    fn target_bleed_uses_scale_magnitude_for_negative_scales() {
        // Demagnifying lenses sample outward and need identical bleed.
        let positive = LensParams {
            scale_x: 180.0,
            scale_y: 180.0,
            ..LensParams::default()
        };
        let negative = LensParams {
            scale_x: -180.0,
            scale_y: -180.0,
            ..LensParams::default()
        };
        assert_eq!(target_bleed(&positive), target_bleed(&negative));
        assert!(target_bleed(&negative) > 0);
    }

    #[test]
    fn computes_normalized_and_pixel_geometry() {
        let lens = LensParams {
            width: 100.0,
            height: 50.0,
            radius: 40.0,
            ..LensParams::default()
        };
        let normalized = compute_lens_geometry(GeometryInput {
            container_width: 400.0,
            container_height: 200.0,
            x: 0.5,
            y: 0.5,
            unit: PositionUnit::Normalized,
            mode: RenderMode::Source,
            lens,
        });
        let px = compute_lens_geometry(GeometryInput {
            x: 200.0,
            y: 100.0,
            unit: PositionUnit::Px,
            ..GeometryInput {
                container_width: 400.0,
                container_height: 200.0,
                mode: RenderMode::Source,
                lens,
                x: 0.0,
                y: 0.0,
                unit: PositionUnit::Normalized,
            }
        });

        assert_eq!(normalized.left, 150.0);
        assert_eq!(normalized.top, 75.0);
        assert_eq!(normalized, px);
    }

    #[test]
    fn target_mode_clamps_filter_region_to_container() {
        let lens = LensParams {
            width: 100.0,
            height: 80.0,
            ..LensParams::default()
        };
        let geometry = compute_lens_geometry(GeometryInput {
            container_width: 200.0,
            container_height: 120.0,
            x: 0.0,
            y: 0.0,
            unit: PositionUnit::Normalized,
            mode: RenderMode::Target,
            lens,
        });

        assert!(geometry.filter_x >= 0.0);
        assert!(geometry.filter_y >= 0.0);
        assert!(geometry.filter_width >= 0.0);
        assert!(geometry.filter_x + geometry.filter_width <= 200.0);
        assert!(geometry.filter_y + geometry.filter_height <= 120.0);
        // The region bleed is the exact bleed quantized up to the 64px grid.
        assert_eq!(geometry.bleed, target_bleed(&lens).div_ceil(64) * 64);

        // Lens fully outside the container collapses to an empty filter region.
        let outside = compute_lens_geometry(GeometryInput {
            container_width: 200.0,
            container_height: 120.0,
            x: -500.0,
            y: -500.0,
            unit: PositionUnit::Px,
            mode: RenderMode::Target,
            lens,
        });
        assert_eq!(outside.filter_width, 0.0);
    }

    #[test]
    fn negative_radius_is_floored_at_zero() {
        let geometry = compute_lens_geometry(GeometryInput {
            container_width: 200.0,
            container_height: 120.0,
            x: 0.5,
            y: 0.5,
            unit: PositionUnit::Normalized,
            mode: RenderMode::Source,
            lens: LensParams {
                radius: -10.0,
                ..LensParams::default()
            },
        });

        assert_eq!(geometry.radius, 0.0);
    }

    #[test]
    fn color_matrix_scales_red_and_green_against_dominant_axis() {
        let matrix = color_matrix_for_scale(10.0, 20.0);
        let expected = [
            0.5, 0.0, 0.0, 0.0, 0.25, //
            0.0, 1.0, 0.0, 0.0, 0.0, //
            0.0, 0.0, 1.0, 0.0, 0.0, //
            0.0, 0.0, 0.0, 1.0, 0.0,
        ];
        assert_eq!(matrix, expected);

        // Zero scales must not divide by zero.
        let zero = color_matrix_for_scale(0.0, 0.0);
        assert_eq!(zero[0], 0.0);
        assert_eq!(zero[6], 0.0);
        assert_eq!(zero[4], 0.5);
        assert_eq!(zero[9], 0.5);
    }
}
