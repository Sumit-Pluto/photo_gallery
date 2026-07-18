# workers/tilt — Single-Image Camera Calibration (roll / pitch / FOV)

Predicts camera **roll**, **pitch**, and **vertical field-of-view** from one image, based on
[AlanSavio25/DeepSingleImageCalibration](https://github.com/AlanSavio25/DeepSingleImageCalibration).

- **Dockerfile:** `/workers/tilt/Dockerfile` (build context = repo root)
- **GPU:** light — NVIDIA **T4** (16 GB) is plenty; CPU also works, slower.
- **App env var to set on the endpoint:** `RUNPOD_TILT_URL` — the deployed RunPod endpoint URL the app calls.

## Contract
Input:
```json
{ "input": { "image": "<base64>" } }
```
`image` may include a `data:image/...;base64,` prefix (stripped automatically).

Output:
```json
{ "roll_degrees": 0.0, "pitch_degrees": 0.0, "fov_degrees": 0.0 }
```
On error: `{ "error": "..." }`.

## Weights (required — research repo, not on pip)
The pretrained checkpoint is **not** bundled. Download the repo's released weights and place
them on the network volume, then point the worker at them:

- Default path: `/runpod-volume/tilt/weights.tar`
- Override with env var `WEIGHTS_PATH`.

The backbone loads into the volume-cached `TORCH_HOME`/`HF_HOME` on first request.

## Tunable env vars (no rebuild needed)
`WEIGHTS_PATH`, `CALIB_BACKBONE` (densenet161|densenet121), `CALIB_NUM_BINS`,
`CALIB_INPUT_SIZE`, `CALIB_ROLL_MIN/MAX`, `CALIB_VFOV_MIN/MAX`, `CALIB_RHO_MIN/MAX`,
`CALIB_DIRECT_PITCH` (=1 if the net outputs pitch directly), `CALIB_PITCH_MIN/MAX`.
