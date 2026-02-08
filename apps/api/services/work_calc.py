"""
Work Units and Earnings Calculation Engine (P3-1)

Deterministic function: compute_work_units_and_earned(worker, project, payload)

Rate selection priority:
  1. payload rate_per_unit (if provided)
  2. worker.rate_per_unit override
  3. project.default_unit_rate
  4. work_type.default_unit_rate
  5. worker.rate_per_hour (legacy fallback)
  6. project.default_rate_per_hour (legacy fallback)
"""

from typing import Optional, Dict, Any


def compute_work_units_and_earned(
    worker,
    project,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compute units_done, rate_per_unit, earned from worker/project/payload.
    Returns dict with { unit_type, units_done, rate_per_unit, earned }.
    """
    # Determine unit_type
    unit_type = payload.get("unit_type")
    if not unit_type and project and getattr(project, "unit_type", None):
        unit_type = project.unit_type
    if not unit_type and project and getattr(project, "work_type", None):
        wt = project.work_type
        if wt and getattr(wt, "unit_type", None):
            unit_type = wt.unit_type
    if not unit_type:
        unit_type = "HOURS"

    # Determine units_done
    units_done = payload.get("units_done")
    if units_done is None:
        if unit_type == "HOURS":
            units_done = payload.get("hours_worked", 0)
        elif unit_type == "SHIFTS":
            units_done = 1.0
        else:
            units_done = 0.0

    units_done = float(units_done) if units_done else 0.0

    # Determine rate_per_unit (priority cascade)
    rate = None

    # 1. Payload override
    if payload.get("rate_per_unit") is not None:
        rate = int(payload["rate_per_unit"])

    # 2. Worker override
    if rate is None and worker and getattr(worker, "rate_per_unit", None):
        rate = worker.rate_per_unit

    # 3. Project default_unit_rate
    if rate is None and project and getattr(project, "default_unit_rate", None):
        rate = project.default_unit_rate

    # 4. Work type default_unit_rate
    if rate is None and project and getattr(project, "work_type", None):
        wt = project.work_type
        if wt and getattr(wt, "default_unit_rate", None):
            rate = wt.default_unit_rate

    # 5. Legacy fallback: worker rate_per_hour
    if rate is None and worker and getattr(worker, "rate_per_hour", None):
        rate = worker.rate_per_hour

    # 6. Legacy fallback: project default_rate_per_hour
    if rate is None and project and getattr(project, "default_rate_per_hour", None):
        rate = project.default_rate_per_hour

    if rate is None:
        rate = 0

    # Compute earned
    earned = round(units_done * rate)

    return {
        "unit_type": unit_type,
        "units_done": round(units_done, 2),
        "rate_per_unit": rate,
        "earned": earned,
    }
