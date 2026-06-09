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
        target_bleed(&input.lens)
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
        radius: input.lens.radius.min(width * 0.5).min(height * 0.5),
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
    (params.scale_x.max(params.scale_y) * (1.0 + 0.2 * params.chroma) + params.blur + 4.0).ceil()
        as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lens::LensParams;

    #[test]
    fn target_bleed_matches_prototype_formula() {
        let lens = LensParams {
            scale_x: 20.0,
            scale_y: 10.0,
            chroma: 0.5,
            blur: 2.1,
            ..LensParams::default()
        };

        assert_eq!(target_bleed(&lens), 29);
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
}
