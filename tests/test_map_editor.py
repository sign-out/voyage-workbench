import json
import unittest

from workbench import map_editor


WORLD = ('{"world":{"initialGameState":{'
         '"heroesVersion":36,"huge":9007199254740993,"fraction":1.000,'
         '"locationSettings":{"regionSize":100},"realms":{"Earth":{"name":"Earth"}},'
         '"regions":{"Coast":{"name":"Coast","realm":"Earth","x":0,"y":0,"future":"keep"}},'
         '"locations":{"Dock":{"name":"Dock","region":"Coast","x":-20,"y":10,"radius":2}}'
         '}}}')


class MapEditorTests(unittest.TestCase):
    def test_authored_map_settings_preserve_other_source_and_envelope(self):
        from workbench import document
        source='{"shortId":"world","initialGameState":{"heroesVersion":36,"locationSettings":{"regionSize":100,"simpleRadius":2.000,"future":9007199254740993},"locations":{"L":{"x":12.3400,"y":-4,"region":"R"}},"unknown":1.2300}}'
        changed=map_editor.edit(source,'set-settings',{'regionSize':250.5,'regionMapBorderFeatheringEnabled':False})
        state=document.parse(document.section(changed,['initialGameState']))
        self.assertEqual(state['locationSettings']['regionSize'].lexeme,'250.5')
        self.assertFalse(state['locationSettings']['regionMapBorderFeatheringEnabled'])
        for token in ('"simpleRadius":2.000','"future":9007199254740993','"x":12.3400','"unknown":1.2300'):
            self.assertIn(token,changed)
        self.assertEqual(map_editor.inspect(changed)['regionSize'],250.5)
        self.assertFalse(map_editor.inspect(changed)['regionMapBorderFeatheringEnabled'])

    def test_map_settings_default_flag_and_new_documented_settings(self):
        source='{"heroesVersion":36}'
        self.assertTrue(map_editor.inspect(source)['regionMapBorderFeatheringEnabled'])
        changed=map_editor.edit(source,'set-settings',{'regionSize':10})
        result=json.loads(changed)
        self.assertEqual(result['locationSettings']['simpleRadius'],2)
        self.assertTrue(result['locationSettings']['regionMapBorderFeatheringEnabled'])
        self.assertTrue(any('avgTravelDistance' in warning for warning in map_editor.inspect(changed)['warnings']))
        for value in (0,-1,True,'100',float('inf'),float('nan')):
            with self.subTest(value=value),self.assertRaises(ValueError):
                map_editor.edit(source,'set-settings',{'regionSize':value})
        with self.assertRaises(ValueError):map_editor.edit(source,'set-settings',{'regionMapBorderFeatheringEnabled':'false'})
        with self.assertRaises(ValueError):map_editor.edit(source,'set-settings',{'featherEdges':True})
    def test_projection_and_coordinate_warnings(self):
        data=map_editor.inspect(WORLD)
        self.assertEqual(data['regionSize'],100)
        self.assertEqual(data['regions'][0]['x'],0)
        self.assertEqual(data['locations'][0]['y'],10)
        self.assertEqual(data['warnings'],[])
        moved=map_editor.edit(WORLD,'move-region',{'key':'Coast','x':3,'y':0})
        added=map_editor.edit(moved,'add-region',{'key':'Far Hills','realm':'Earth','x':0,'y':0})
        self.assertTrue(any('disconnected' in w for w in map_editor.inspect(added)['warnings']))

    def test_add_drag_fields_and_delete_preserve_unrelated_text(self):
        text=map_editor.edit(WORLD,'add-location',{'key':'Shrine','region':'Coast','x':12.5,'y':-5})
        text=map_editor.edit(text,'move-location',{'key':'Dock','x':22,'y':-18.25})
        text=map_editor.edit(text,'set-field',{'kind':'region','key':'Coast','field':'imageUrl','value':'https://example.test/map.png'})
        text=map_editor.edit(text,'set-field',{'kind':'location','key':'Shrine','field':'radius','value':3.5})
        self.assertIn('"huge":9007199254740993,"fraction":1.000',text)
        state=json.loads(text)['world']['initialGameState']
        self.assertEqual(state['locations']['Shrine']['radius'],3.5)
        self.assertEqual(state['locations']['Dock']['y'],-18.25)
        self.assertEqual(state['regions']['Coast']['images']['map']['imageUrl'],'https://example.test/map.png')
        self.assertEqual(state['regions']['Coast']['future'],'keep')
        with self.assertRaisesRegex(ValueError,'locations'):
            map_editor.edit(text,'delete-region',{'key':'Coast'})
        text=map_editor.edit(text,'delete-location',{'key':'Shrine'})
        text=map_editor.edit(text,'delete-location',{'key':'Dock'})
        text=map_editor.edit(text,'delete-region',{'key':'Coast'})
        self.assertEqual(map_editor.inspect(text)['regions'],[])

    def test_rejects_occupied_grid_and_out_of_bounds_location(self):
        with self.assertRaisesRegex(ValueError,'already contains'):
            map_editor.edit(WORLD,'add-region',{'key':'Other','realm':'Earth','x':0,'y':0})
        with self.assertRaisesRegex(ValueError,'within'):
            map_editor.edit(WORLD,'move-location',{'key':'Dock','x':51,'y':0})
        with self.assertRaisesRegex(ValueError,'integer'):
            map_editor.edit(WORLD,'move-region',{'key':'Coast','x':0.5,'y':1})

    def test_place_legacy_region_without_realm_or_coordinates(self):
        source = '{"heroesVersion":36,"realms":{},"regions":{"Coast":{"name":"Coast","basicInfo":"Keep this"}},"locations":{}}'
        text = map_editor.edit(source, 'add-realm', {'key':'Earth'})
        text = map_editor.edit(text, 'place-region', {'key':'Coast','realm':'Earth','x':2,'y':-1})
        state = json.loads(text)
        self.assertEqual(state['regions']['Coast'], {'name':'Coast','basicInfo':'Keep this','realm':'Earth','x':2,'y':-1})
        self.assertEqual(map_editor.inspect(text)['warnings'], [])
        with self.assertRaisesRegex(ValueError,'already contains'):
            map_editor.edit(text, 'add-region', {'key':'Other','realm':'Earth','x':2,'y':-1})
