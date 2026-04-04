# Tuning Notes

- `erosion.takeABreathPauseMs = 5000` was not fixed in `api.md`; implementation defaulted it here.
- `erosion.shortBreakPauseMs = 15000` was not fixed in `api.md`; implementation defaulted it here.
- `itemEffects.catsEyeDurationMs = 10000` was not fixed in `api.md`; implementation defaulted it here.
- `itemEffects.disposableLifeDurationMs = 10000` was not fixed in `api.md`; implementation defaulted it here.
- `room.seatReservationTimeoutSec = 15` comes from the shared config schema example because `api.md` only defines major room parameters.
- `items.json` mirrors those unresolved durations directly: `cats_eye.durationMs = 10000`, `take_a_breath.durationMs = 5000`, `short_break.durationMs = 15000`, and `disposable_life.durationMs = 10000`.
