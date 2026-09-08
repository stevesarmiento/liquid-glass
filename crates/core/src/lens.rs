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
    pub glow_spread: f32,
    pub glow_exponent: f32,
    pub edge_exponent: f32,
    pub specular_rotation: f32,
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
    pub glow_spread: Option<f32>,
    pub glow_exponent: Option<f32>,
    pub edge_exponent: Option<f32>,
    pub specular_rotation: Option<f32>,
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
            glow_spread: 0.62,
            glow_exponent: 1.5,
            edge_exponent: 1.2,
            specular_rotation: 45.0,
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
    // Depth caps at the FULL short side (not half): past min(w,h)/2 the erf
    // falloff sigma keeps softening the ramp. Kept in lockstep with
    // LENS_PARAM_LIMITS in the TS engine.
    let depth = finite_or(input.depth, defaults.depth).clamp(0.0, width.min(height));
    let map_size = input.map_size.unwrap_or(defaults.map_size).clamp(8, 2048);

    LensParams {
        width,
        height,
        radius,
        // Negative scale = demagnify (render-time sample direction flip);
        // kept in lockstep with the TS engine's -512..512 range.
        scale_x: finite_or(input.scale_x, defaults.scale_x).clamp(-512.0, 512.0),
        scale_y: finite_or(input.scale_y, defaults.scale_y).clamp(-512.0, 512.0),
        chroma: finite_or(input.chroma, defaults.chroma).clamp(0.0, 8.0),
        depth,
        dome: finite_or(input.dome, defaults.dome).clamp(0.0, 4096.0),
        splay: finite_or(input.splay, defaults.splay).clamp(0.001, 1.0),
        glow: finite_or(input.glow, defaults.glow).clamp(0.0, 4.0),
        edge: finite_or(input.edge, defaults.edge).clamp(0.0, 4.0),
        glow_spread: finite_or(input.glow_spread, defaults.glow_spread).clamp(0.05, 2.0),
        glow_exponent: finite_or(input.glow_exponent, defaults.glow_exponent).clamp(0.1, 8.0),
        edge_exponent: finite_or(input.edge_exponent, defaults.edge_exponent).clamp(0.1, 8.0),
        specular_rotation: finite_or(input.specular_rotation, defaults.specular_rotation)
            .clamp(-360.0, 360.0),
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

    #[test]
    fn normalize_clamps_specular_params() {
        let params = normalize_lens_params(PartialLensParams {
            glow_spread: Some(99.0),
            glow_exponent: Some(0.0),
            edge_exponent: Some(100.0),
            specular_rotation: Some(-1000.0),
            ..PartialLensParams::default()
        });

        assert_eq!(params.glow_spread, 2.0);
        assert_eq!(params.glow_exponent, 0.1);
        assert_eq!(params.edge_exponent, 8.0);
        assert_eq!(params.specular_rotation, -360.0);
    }

    #[test]
    fn normalize_replaces_nan_inputs_with_defaults() {
        let params = normalize_lens_params(PartialLensParams {
            width: Some(f32::NAN),
            height: Some(f32::INFINITY),
            radius: Some(f32::NAN),
            scale_x: Some(f32::NAN),
            chroma: Some(f32::NEG_INFINITY),
            depth: Some(f32::NAN),
            dome: Some(f32::NAN),
            splay: Some(f32::NAN),
            glow: Some(f32::NAN),
            edge: Some(f32::NAN),
            glow_spread: Some(f32::NAN),
            glow_exponent: Some(f32::NAN),
            edge_exponent: Some(f32::NAN),
            specular_rotation: Some(f32::NAN),
            blur: Some(f32::NAN),
            ..PartialLensParams::default()
        });

        assert_eq!(params, LensParams::default());
    }
}
