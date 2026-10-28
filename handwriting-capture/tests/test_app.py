import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from app import create_app


def sample(c='a'):
    return {'character':c, 'strokes':[{'pointerType':'pen','points':[
        {'x':100,'y':120,'timestamp':0,'pressure':0.5,'tiltX':10,'tiltY':-5},
        {'x':150,'y':220,'timestamp':10,'pressure':0.6,'tiltX':11,'tiltY':-4}]},
        {'pointerType':'pen','points':[{'x':160,'y':200,'timestamp':30,'pressure':0.2}]}]}

class AppTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)
        self.client=create_app(self.path).test_client()

    def test_storage_restart_and_raw_separation(self):
        payload=sample()
        r=self.client.post('/api/samples',json=payload)
        self.assertEqual(r.status_code,201)
        raw=next((self.path/'raw').glob('*.json'))
        processed=self.path/'processed'/raw.name
        before=raw.read_bytes()
        self.assertEqual(json.loads(before)['strokes'],payload['strokes'])
        self.assertEqual(json.loads(processed.read_text())['strokes'],payload['strokes'])
        processed.write_text('{}')
        self.assertEqual(raw.read_bytes(),before)
        fresh=create_app(self.path).test_client()
        self.assertEqual(len(fresh.get('/api/samples').json['a']),1)
        fresh.post('/api/samples',json=payload)
        self.assertEqual(len(list((self.path/'raw').glob('*.json'))),2)

    def test_invalid_samples(self):
        for payload in [None,[],{}, {'character':'z'}, {'character':'a','strokes':[]}]:
            self.assertEqual(self.client.post('/api/samples',json=payload).status_code in (400,415),True)
        for key,value in [('x',401),('pressure',2),('timestamp',-1),('tiltX',91),('x',True)]:
            payload=sample();payload['strokes'][0]['points'][0][key]=value
            self.assertEqual(self.client.post('/api/samples',json=payload).status_code,400)
        payload=sample();payload['strokes'][1]['points'][0]['timestamp']=1
        self.assertEqual(self.client.post('/api/samples',json=payload).status_code,400)
        self.assertFalse(list((self.path/'raw').glob('*.json')))

    def test_svg_order_scale_and_latest(self):
        for c in 'abcde': self.client.post('/api/samples',json=sample(c))
        last=self.client.post('/api/samples',json=sample()).json
        r=self.client.post('/api/compose',json={'text':'abcde bad cab\nea'})
        self.assertEqual(r.status_code,200)
        root=ET.fromstring(r.data)
        paths=list(root.iter('{http://www.w3.org/2000/svg}path'))
        self.assertEqual(len(paths),26)
        self.assertEqual(paths[0].attrib['data-sample'],last['id'])
        self.assertEqual(paths[0].attrib['d'],'M 10.0000 22.0000 L 15.0000 32.0000')
        self.assertEqual(paths[1].attrib['d'],'M 16.0000 30.0000 L 16.0000 30.0000')
        self.assertTrue(root.attrib['width'].endswith('mm'))

    def test_composition_validation_and_static(self):
        for text in ['', ' ', 'a'*121, 'hello', '<script>', 'a']:
            self.assertEqual(self.client.post('/api/compose',json={'text':text}).status_code,400)
        for url in ('/', '/static/app.js'):
            with self.client.get(url) as response:
                self.assertEqual(response.status_code,200)
        self.assertEqual(self.client.post('/api/samples',data='{',content_type='application/json').status_code,400)

if __name__=='__main__': unittest.main()

class ReviewTests(unittest.TestCase):
    def test_adjustment_variants_and_originals(self):
        with tempfile.TemporaryDirectory() as directory:
            client=create_app(directory).test_client()
            a=client.post('/api/samples',json=sample()).json
            b=client.post('/api/samples',json=sample()).json
            path=Path(directory)/'raw'/(a['id']+'.json'); original=path.read_bytes()
            config={a['id']:{'enabled':True,'scale':.8,'shift':10},b['id']:{'enabled':True,'scale':1,'shift':0}}
            self.assertEqual(client.post('/api/review',json=config).status_code,200)
            self.assertEqual(create_app(directory).test_client().get('/api/review').json,config)
            svg=ET.fromstring(client.post('/api/compose',json={'text':'aaa','selection':'variants'}).data)
            ids=[p.attrib['data-sample'] for p in svg.iter('{http://www.w3.org/2000/svg}path')][::2]
            self.assertNotEqual(ids[0],ids[1]);self.assertEqual(ids[0],ids[2])
            config[b['id']]['enabled']=False
            client.post('/api/review',json=config)
            svg=ET.fromstring(client.post('/api/compose',json={'text':'a'}).data)
            first=next(svg.iter('{http://www.w3.org/2000/svg}path'))
            self.assertEqual(first.attrib['d'],'M 10.0000 25.0000 L 14.0000 33.0000')
            self.assertEqual(path.read_bytes(),original)
            config[a['id']]['scale']=0
            self.assertEqual(client.post('/api/review',json=config).status_code,400)


class BaselineTests(unittest.TestCase):
    def test_capture_height_does_not_change_output_baseline(self):
        with tempfile.TemporaryDirectory() as directory:
            client=create_app(directory).test_client()
            outputs=[]
            for offset in (0, -70):
                payload=sample()
                for stroke in payload['strokes']:
                    for point in stroke['points']:
                        point['y'] += offset
                record=client.post('/api/samples',json=payload).json
                source=Path(directory)/'raw'/(record['id']+'.json')
                before=source.read_bytes()
                svg=ET.fromstring(client.post('/api/compose',json={'text':'a'}).data)
                outputs.append([p.attrib['d'] for p in svg.iter('{http://www.w3.org/2000/svg}path')])
                self.assertEqual(before,source.read_bytes())
            self.assertEqual(outputs[0],outputs[1])
