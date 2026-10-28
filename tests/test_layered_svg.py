"""Check visible-colour hatch generation independently of browser rendering."""

import subprocess
import unittest


class LayeredSvgTests(unittest.TestCase):
    def run_js(self, script):
        subprocess.run(
            ['node', '-e', "const s=require('./assets/svg-import.js');"
             "const assert=require('node:assert/strict');" + script],
            check=True, capture_output=True, text=True,
        )

    def test_white_occludes_underlying_colour_and_colours_stay_separate(self):
        self.run_js("""
          const data=new Uint8ClampedArray([
            255,0,0,255, 255,255,255,255, 0,0,255,255, 0,0,255,255]);
          const p=s.rgbaToHatches({data,width:4,height:1},
            ['#ff0000','#ffffff','#0000ff'],{pixelsPerMm:1,spacing:1});
          assert.deepEqual(p.colours,['#ff0000','#0000ff']);
          assert.deepEqual(p, Object.assign([[[0,0.5],[1,0.5]],
            [[2,0.5],[4,0.5]]],{colours:['#ff0000','#0000ff']}));
        """)

    def test_spacing_is_measured_on_final_page_and_rows_alternate(self):
        self.run_js("""
          const data=new Uint8ClampedArray(4*4*4);
          for(let i=0;i<data.length;i+=4){data[i]=255;data[i+3]=255;}
          const p=s.rgbaToHatches({data,width:4,height:4},['#ff0000'],
            {pixelsPerMm:2,spacing:1});
          assert.equal(p.length,2);
          assert.equal(p[1][0][1]-p[0][0][1],1);
          assert.ok(p[0][0][0]<p[0][1][0]);
          assert.ok(p[1][0][0]>p[1][1][0]);
        """)

    def test_pale_paper_can_be_skipped_or_plotted(self):
        self.run_js("""
          const image={data:new Uint8ClampedArray([237,255,255,255]),width:1,height:1};
          assert.equal(s.rgbaToHatches(image,['#edffff'],
            {pixelsPerMm:1,spacing:1}).length,0);
          assert.equal(s.rgbaToHatches(image,['#edffff'],
            {pixelsPerMm:1,spacing:1,leaveWhite:false}).length,1);
          const paper={data:new Uint8ClampedArray([255,255,255,0]),width:1,height:1};
          assert.equal(s.rgbaToHatches(paper,['#ffffff'],
            {pixelsPerMm:1,spacing:1,leaveWhite:false}).length,0);
          assert.throws(()=>s.rgbaToHatches(image,['#edffff'],{spacing:0}));
        """)
