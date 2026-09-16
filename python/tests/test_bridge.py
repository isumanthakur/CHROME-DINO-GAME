"""The JS/WASM contract.

Whatever the engine does internally, what crosses into JavaScript is a JSON
document. These tests guard that boundary: valid JSON, primitives only, and a
payload small enough to build sixty times a second.
"""

import json

import pytest

import bridge


@pytest.fixture(autouse=True)
def fresh_game():
    bridge.new_game(4242)
    yield


def test_every_entry_point_returns_valid_json():
    for payload in (bridge.new_game(1), bridge.step(1 / 60.0, 0),
                    bridge.snapshot(), bridge.engine_info()):
        assert isinstance(payload, str)
        json.loads(payload)


def test_snapshot_has_the_keys_the_renderer_expects():
    snapshot = json.loads(bridge.snapshot())
    for key in ("phase", "score", "speed", "night", "shake", "dino",
                "obstacles", "clouds", "bumps", "particles", "events"):
        assert key in snapshot, f"renderer depends on '{key}'"

    for key in ("x", "y", "w", "h", "ducking", "grounded", "runPhase",
                "squash", "blinking", "face"):
        assert key in snapshot["dino"]


def test_payload_contains_only_json_primitives():
    """No Python objects may leak across the boundary."""

    def check(value, path="root"):
        if isinstance(value, dict):
            for k, v in value.items():
                assert isinstance(k, str), f"{path}: non-string key {k!r}"
                check(v, f"{path}.{k}")
        elif isinstance(value, list):
            for i, v in enumerate(value):
                check(v, f"{path}[{i}]")
        else:
            assert isinstance(value, (str, int, float, bool, type(None))), \
                f"{path}: {type(value).__name__} is not JSON-safe"

    bridge.new_game(4242)
    for _ in range(400):
        check(json.loads(bridge.step(1 / 60.0, 0)))


def test_per_frame_payload_stays_small():
    """A frame must stay comfortably inside the 16ms budget to serialise."""
    bridge.new_game(4242)
    largest = 0
    for _ in range(60 * 90):
        largest = max(largest, len(bridge.step(1 / 60.0, 0)))
    assert largest < 32_000, f"frame payload grew to {largest} bytes"


def test_new_game_with_a_seed_is_reproducible():
    first = [bridge.step(1 / 60.0, i % 3) for i in range(300)]
    bridge.new_game(4242)
    second = [bridge.step(1 / 60.0, i % 3) for i in range(300)]
    assert first == second


def test_engine_info_reports_the_runtime():
    info = json.loads(bridge.engine_info())
    assert info["engine"]
    assert info["python"].startswith("3.")
    assert info["implementation"]
