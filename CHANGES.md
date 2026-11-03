# Changes in this handoff

- Added a map-view selector to the Metro Tehran planner.
- The default view is the metro-line view (`schematic`); the geographic view remains available.
- The selected view is saved in localStorage (`metro-map-mode`) and restored on the next visit.
- Both views use the same station selection callback, so tapping a station selects the same origin/destination fields and keeps interchange-line selection behavior.
- In line-map mode, route paths are drawn with orthogonal bends, line strokes and station/interchange markers are emphasized, and geographic area shortcuts are hidden.

## Important limitation

The current line-map view is an interactive schematic-style rendering generated from the project's existing station coordinates and route order data. It is not a pixel-accurate digitization of the official printed Tehran Metro schematic. Before public launch, verify station coverage, route branches, and the timetable data against current primary sources. The existing timetable values should not be treated as verified departure times until that audit is complete.
