"""Tiny math helpers. Kept dependency-free so the engine runs anywhere."""


def clamp(value: float, low: float, high: float) -> float:
    """Constrain ``value`` to the inclusive range ``[low, high]``."""
    if value < low:
        return low
    if value > high:
        return high
    return value


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    """Hermite ease from 0 to 1 as ``x`` crosses ``edge0`` -> ``edge1``."""
    if edge0 == edge1:
        return 0.0 if x < edge0 else 1.0
    t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def approach(current: float, target: float, rate: float, dt: float) -> float:
    """Move ``current`` toward ``target`` at most ``rate`` units per second."""
    step = rate * dt
    if current < target:
        return min(current + step, target)
    return max(current - step, target)


def decay(value: float, rate: float, dt: float) -> float:
    """Frame-rate independent exponential decay toward zero."""
    return value * pow(2.718281828459045, -rate * dt)
