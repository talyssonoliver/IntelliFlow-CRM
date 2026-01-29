from __future__ import annotations

import affected


def test_map_files_to_packages_and_global_trigger() -> None:
    packages = [
        affected.PackageInfo(name="pkg-a", path="packages/a"),
        affected.PackageInfo(name="pkg-b", path="packages/b"),
    ]
    changed_files = [
        "packages/a/src/index.ts",
        "README.md",
        "package.json",  # global trigger
    ]

    mapping, pkgs, global_change = affected.map_files_to_packages(changed_files, packages)

    assert global_change is True
    assert pkgs == {"pkg-a"}
    assert mapping["packages/a/src/index.ts"] == ["pkg-a"]
    assert mapping["README.md"] == []


def test_transitive_dependents_closure() -> None:
    graph = {
        "a": affected.PackageGraphNode(name="a", path="a", dependencies=(), dependents=("b", "c")),
        "b": affected.PackageGraphNode(name="b", path="b", dependencies=(), dependents=("d",)),
        "c": affected.PackageGraphNode(name="c", path="c", dependencies=(), dependents=()),
        "d": affected.PackageGraphNode(name="d", path="d", dependencies=(), dependents=()),
    }

    closure = affected.transitive_dependents({"a"}, graph)
    assert closure == {"a", "b", "c", "d"}

