use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;

use crate::{
    compute_lens_geometry, generate_displacement_map, normalize_lens_params, GeometryInput,
    PartialLensParams,
};

#[wasm_bindgen(js_name = generateDisplacementMap)]
pub fn wasm_generate_displacement_map(params: JsValue) -> Result<Uint8Array, JsValue> {
    let partial: PartialLensParams = serde_wasm_bindgen::from_value(params)?;
    let params = normalize_lens_params(partial);
    let map = generate_displacement_map(&params);
    Ok(Uint8Array::from(map.rgba.as_slice()))
}

#[wasm_bindgen(js_name = computeLensGeometry)]
pub fn wasm_compute_lens_geometry(input: JsValue) -> Result<JsValue, JsValue> {
    let input: GeometryInput = serde_wasm_bindgen::from_value(input)?;
    let geometry = compute_lens_geometry(input);
    serde_wasm_bindgen::to_value(&geometry).map_err(Into::into)
}
