"""Axis-aligned bounding-box collision.

The original 2021 version compared ``getComputedStyle`` strings against magic
numbers every 10ms, which is why it let you walk through cacti and killed you
in mid-air. This is the honest version: real boxes, checked against the same
simulation that moved them.
"""


def overlaps(a, b) -> bool:
    """True when two ``(left, top, right, bottom)`` boxes intersect."""
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    return ax0 < bx1 and bx0 < ax1 and ay0 < by1 and by0 < ay1


def hits_any(box, obstacles) -> bool:
    """True when ``box`` intersects any obstacle's hitbox."""
    for obstacle in obstacles:
        if overlaps(box, obstacle.hitbox()):
            return True
    return False
