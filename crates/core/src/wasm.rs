use js_sys::Uint8Array;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

use crate::{
    compute_lens_geometry, generate_displacement_map, normalize_lens_params, GeometryInput,
    PartialLensParams, PositionUnit, RenderMode,
};

/// Geometry input as received from JS: the lens may be partial (or missing),
/// and is normalized before computing so NaN/invalid values never propagate.
#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmGeometryInput {
    container_width: f32,
    container_height: f32,
    x: f32,
    y: f32,
    #[serde(default)]
    unit: PositionUnit,
    #[serde(default)]
    mode: RenderMode,
    #[serde(default)]
    lens: PartialLensParams,
}

#[wasm_bindgen(js_name = generateDisplacementMap)]
pub fn wasm_generate_displacement_map(params: JsValue) -> Result<Uint8Array, JsValue> {
    let partial: PartialLensParams = serde_wasm_bindgen::from_value(params)?;
    let params = normalize_lens_params(partial);
    let map = generate_displacement_map(&params);
    Ok(Uint8Array::from(map.rgba.as_slice()))
}

#[wasm_bindgen(js_name = computeLensGeometry)]
pub fn wasm_compute_lens_geometry(input: JsValue) -> Result<JsValue, JsValue> {
    let input: WasmGeometryInput = serde_wasm_bindgen::from_value(input)?;
    let geometry = compute_lens_geometry(GeometryInput {
        container_width: input.container_width,
        container_height: input.container_height,
        x: input.x,
        y: input.y,
        unit: input.unit,
        mode: input.mode,
        lens: normalize_lens_params(input.lens),
    });
    serde_wasm_bindgen::to_value(&geometry).map_err(Into::into)
}

#[wasm_bindgen(js_name = normalizeLensParams)]
pub fn wasm_normalize_lens_params(params: JsValue) -> Result<JsValue, JsValue> {
    let partial: PartialLensParams = serde_wasm_bindgen::from_value(params)?;
    serde_wasm_bindgen::to_value(&normalize_lens_params(partial)).map_err(Into::into)
}
