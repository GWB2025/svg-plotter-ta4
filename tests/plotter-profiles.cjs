const {test} = require('node:test');
const assert = require('node:assert/strict');
const SVG = require('../assets/svg-import.js');
const Guides = require('../assets/page-guides.js');
const profile={width:420,height:297,x_direction:-1,y_direction:1,pen_up:3,pen_down:0,
  lift_feed:800,stroke_feed:1000,travel_feed:1800,draw_feed:600,fingerprint:'a'.repeat(64)};
test('A3 profiles control bed bounds, axis directions, heights and feeds',()=>{
  const paths=[[[350,20],[400,30]]];
  assert.throws(()=>SVG.makeGcode(paths),/page/);
  const gcode=SVG.makeGcode(paths,{profile});
  assert.ok(gcode.startsWith('; PLOTTER_PROFILE '+profile.fingerprint+'\n'));
  assert.ok(gcode.includes('G90 G1 Z3 F800'));
  assert.ok(gcode.includes('G90 G1 X-350.0000 Y20.0000 F1800'));
  assert.ok(gcode.includes('G90 G1 Z0 F1000'));
  assert.ok(gcode.includes('G90 G1 X-400.0000 Y30.0000 F600'));
  assert.throws(()=>SVG.makeGcode([[[421,0],[1,1]]],{profile}),/page/);
});
test('colour passes use one profile marker and park with correct lift',()=>{
  const code=SVG.makeColourGcode([[[350,20],[400,30]],[[30,40],[40,50]]],['#ff0000','#000000'],{}, {profile});
  assert.equal((code.match(/PLOTTER_PROFILE/g)||[]).length,1);
  assert.equal((code.match(/G90 G1 X0 Y0 F1800/g)||[]).length,2);
  assert.equal((code.match(/PEN_CHANGE/g)||[]).length,2);
});
test('page fitting and positioning guides follow selected bed dimensions',()=>{
  const paths=[[[0,0],[500,500]]];
  const placed=SVG.placePaths(paths,{width:420,height:297,profile,margin:0});
  assert.equal(placed[0][1][1],297);
  assert.equal(Guides.create({width:420,height:297,profile}).paths[2][1][0],420);
  assert.throws(()=>Guides.create({width:421,height:297,profile}),/bed/);
});
