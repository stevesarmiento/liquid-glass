use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LensParams {
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub chroma: f32,
    pub depth: f32,
    pub dome: f32,
    pub splay: f32,
    pub glow: f32,
    pub edge: f32,
    pub blur: f32,
    pub map_size: u32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialLensParams {
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub radius: Option<f32>,
    pub scale_x: Option<f32>,
    pub scale_y: Option<f32>,
    pub chroma: Option<f32>,
    pub depth: Option<f32>,
    pub dome: Option<f32>,
    pub splay: Option<f32>,
    pub glow: Option<f32>,
    pub edge: Option<f32>,
    pub blur: Option<f32>,
    pub map_size: Option<u32>,
}

impl Default for LensParams {
    fn default() -> Self {
        Self {
            width: 180.0,
            height: 120.0,
            radius: 36.0,
            scale_x: 18.0,
            scale_y: 18.0,
            chroma: 0.35,
            depth: 18.0,
            dome: 90.0,
            splay: 0.78,
            glow: 0.45,
            edge: 0.45,
            blur: 2.4,
            map_size: 256,
        }
    }
}

pub fn normalize_lens_params(input: PartialLensParams) -> LensParams {
    let defaults = LensParams::default();
    let width = finite_or(input.width, defaults.width).clamp(1.0, 4096.0);
    let height = finite_or(input.height, defaults.height).clamp(1.0, 4096.0);
    let max_radius = width.min(height) * 0.5;
    let radius = finite_or(input.radius, defaults.radius).clamp(0.0, max_radius);
    let depth = finite_or(input.depth, defaults.depth).clamp(0.0, max_radius);
    let map_size = input.map_size.unwrap_or(defaults.map_size).clamp(8, 2048);

    LensParams {
        width,
        height,
        radius,
        scale_x: finite_or(input.scale_x, defaults.scale_x).clamp(0.0, 512.0),
        scale_y: finite_or(input.scale_y, defaults.scale_y).clamp(0.0, 512.0),
        chroma: finite_or(input.chroma, defaults.chroma).clamp(0.0, 8.0),
        depth,
        dome: finite_or(input.dome, defaults.dome).clamp(0.0, 4096.0),
        splay: finite_or(input.splay, defaults.splay).clamp(0.001, 1.0),
        glow: finite_or(input.glow, defaults.glow).clamp(0.0, 4.0),
        edge: finite_or(input.edge, defaults.edge).clamp(0.0, 4.0),
        blur: finite_or(input.blur, defaults.blur).clamp(0.0, 128.0),
        map_size,
    }
}

fn finite_or(value: Option<f32>, fallback: f32) -> f32 {
    match value {
        Some(value) if value.is_finite() => value,
        _ => fallback,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_clamps_invalid_dimensions_radius_and_map_size() {
        let params = normalize_lens_params(PartialLensParams {
            width: Some(-10.0),
            height: Some(40.0),
            radius: Some(200.0),
            map_size: Some(2),
            ..PartialLensParams::default()
        });

        assert_eq!(params.width, 1.0);
        assert_eq!(params.height, 40.0);
        assert_eq!(params.radius, 0.5);
        assert_eq!(params.map_size, 8);
    }
}
