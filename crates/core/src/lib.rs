pub mod geometry;
pub mod lens;
pub mod map;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

pub use geometry::{
    color_matrix_for_scale, compute_lens_geometry, target_bleed, GeometryInput, LensGeometry,
    PositionUnit, RenderMode,
};
pub use lens::{normalize_lens_params, LensParams, PartialLensParams};
pub use map::{generate_displacement_map, DisplacementMap};

#[cfg(all(test, target_arch = "wasm32"))]
mod wasm_tests {
    use wasm_bindgen_test::wasm_bindgen_test;

    use crate::{generate_displacement_map, LensParams};

    #[wasm_bindgen_test]
    fn generates_map_bytes_in_wasm() {
        let map = generate_displacement_map(&LensParams {
            map_size: 16,
            ..LensParams::default()
        });

        assert_eq!(map.rgba.len(), 16 * 16 * 4);
    }
}
