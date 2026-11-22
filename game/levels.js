// The Midnight Vault — level definitions.
// Map legend: '#' wall, '.' floor, 'P' player start, 'V' vault, 'E' exit.
// Guards, cameras and loot are defined as structured data below each map.
// Tile coordinates are 0-based (x = column, y = row). Tile size is 40px.
// Every map row is exactly 32 chars; vertical wall columns are 0, 8, 16,
// 24 and 31, so guard patrols stay inside one zone (never cross a wall).

var LEVELS = [
  {
    name: "Marlowe Gallery",
    intro: "Floor 1 — steal the Marlowe Diamond.",
    map: [
      "################################",
      "#P......#.......#......#.......#",
      "#.......#.......#......#.......#",
      "#..###..#.......#..##..#.......#",
      "#..###......##......##.....#...#",
      "#.......#.......#......#.......#",
      "#.####..#...#...#..##..#.......#",
      "#.......#...#.......#..#...#...#",
      "#.......#...#...#......#.......#",
      "#.####..#...#...#..##..#.......#",
      "#.......#.......#......#...#...#",
      "#..##...#.......#......#...V...#",
      "#..##.......#.......#......#...#",
      "#.......#.......#......#...E...#",
      "#.......#.......#......#.......#",
      "################################"
    ],
    guards: [
      { waypoints: [[2, 2], [6, 2]], speed: 70 },
      { waypoints: [[18, 14], [22, 14]], speed: 70 }
    ],
    cameras: [
      { tx: 27, ty: 2, baseAngle: 2.4, sweep: 0.9, speed: 0.7 },
      { tx: 29, ty: 8, baseAngle: 3.14159, sweep: 0.7, speed: 0.9 }
    ],
    loot: [
      { tx: 12, ty: 2, name: "Painting", value: 700 },
      { tx: 24, ty: 2, name: "Necklace", value: 416 },
      { tx: 3, ty: 8, name: "Vase", value: 250 },
      { tx: 12, ty: 14, name: "Watch", value: 180 }
    ]
  },
  {
    name: "Meridian Bank",
    intro: "Floor 2 — the Meridian vault holds the bearer bonds.",
    map: [
      "################################",
      "#P......#.......#......#.......#",
      "#.......#...##..#......#.......#",
      "#..##...#...##..#..##..#...##..#",
      "#..##.......##......##.....##..#",
      "#.......#.......#......#.......#",
      "#.##....#..###..#..##..#...##..#",
      "#.......#.......#......#.......#",
      "#..##...#...##..#......#.......#",
      "#.......#.......#..##..#...##..#",
      "#.##....#..###..#......#.......#",
      "#.......#.......#..##..#...V...#",
      "#..##.......##......##.....##..#",
      "#.......#.......#......#...E...#",
      "#.......#.......#......#.......#",
      "################################"
    ],
    guards: [
      { waypoints: [[2, 5], [6, 5]], speed: 78 },
      { waypoints: [[18, 7], [22, 7]], speed: 78 },
      { waypoints: [[2, 13], [6, 13]], speed: 78 }
    ],
    cameras: [
      { tx: 28, ty: 2, baseAngle: 2.6, sweep: 0.8, speed: 0.8 },
      { tx: 15, ty: 6, baseAngle: 0.0, sweep: 1.0, speed: 0.7 },
      { tx: 28, ty: 11, baseAngle: 3.14159, sweep: 0.7, speed: 1.0 }
    ],
    loot: [
      { tx: 12, ty: 1, name: "Bonds", value: 900 },
      { tx: 20, ty: 5, name: "Gold bars", value: 1200 },
      { tx: 4, ty: 9, name: "Cash stack", value: 450 },
      { tx: 24, ty: 13, name: "Jewels", value: 650 }
    ]
  },
  {
    name: "Gilded Cage",
    intro: "Floor 3 — the casino cage. The big one.",
    map: [
      "################################",
      "#P......#.......#......#.......#",
      "#..##...#...##..#..##..#...##..#",
      "#.......#.......#......#.......#",
      "#.###...#...##..#..##..#...##..#",
      "#...............#.......#......#",
      "#..##...#...##..#......#...V...#",
      "#.......#.......#..##..#.......#",
      "#.###...#...##..#......#...##..#",
      "#.......#..........##..#.......#",
      "#..##...#...##..#......#.......#",
      "#.......#.......#..##..#...##..#",
      "#.###...#...##..#......#.......#",
      "#.......#.......#..........E...#",
      "#.......#.......#......#.......#",
      "################################"
    ],
    guards: [
      { waypoints: [[2, 3], [6, 3]], speed: 86 },
      { waypoints: [[18, 5], [22, 5]], speed: 86 },
      { waypoints: [[2, 13], [6, 13]], speed: 86 }
    ],
    cameras: [
      { tx: 28, ty: 1, baseAngle: 2.6, sweep: 0.8, speed: 0.9 },
      { tx: 15, ty: 6, baseAngle: 0.0, sweep: 1.0, speed: 0.8 },
      { tx: 28, ty: 6, baseAngle: 3.14159, sweep: 0.7, speed: 1.0 },
      { tx: 15, ty: 12, baseAngle: 1.5708, sweep: 0.9, speed: 0.8 }
    ],
    loot: [
      { tx: 12, ty: 1, name: "Chips", value: 800 },
      { tx: 24, ty: 3, name: "Diamond", value: 1500 },
      { tx: 4, ty: 7, name: "Cash stack", value: 500 },
      { tx: 24, ty: 13, name: "Gold watch", value: 700 }
    ]
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LEVELS: LEVELS };
}
