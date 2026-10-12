import json
import unittest
from workbench import characters, document

WORLD = '{"data":{"world":{"title":"World","initialGameState":{"heroesVersion":36,"future":9007199254740993,"npcs":{"Guide":{"name":"Guide","properName":"Mae","basicInfo":"A guide","portraitUrl":"https://example.test/p.png","future":{"n":1.000},"level":1.000}},"premadeCharacters":[{"name":"Mage","backstory":"Old","attributes":{"Wisdom":9007199254740993}}]}}}}'

class CharactersTests(unittest.TestCase):
    def test_discover_both_collections_and_exact_descriptors(self):
        rows=characters.inspect(WORLD)['characters']
        self.assertEqual([r['name'] for r in rows],['Mae','Mage'])
        self.assertEqual(rows[0]['portrait'],'https://example.test/p.png')
        self.assertEqual(rows[1]['path'],['data','world','initialGameState','premadeCharacters',0])
        fields={f['key']:f for f in rows[0]['fields']}
        self.assertEqual(fields['level']['raw'],'1.000')
        self.assertTrue(fields['name']['readOnly'])
        self.assertFalse(fields['gender']['present'])
        self.assertEqual(fields['future']['type'],'object')

    def test_string_and_exact_json_edits_preserve_unknowns_and_wrapper(self):
        rows=characters.inspect(WORLD)['characters']
        changed=characters.edit(WORLD,rows[0]['path'],{'basicInfo':'A café guide 👋','level':{'raw':'9007199254740995'},'personality':{'raw':'["calm","kind"]'}},rows[0]['raw'])
        self.assertIn('"future":9007199254740993',changed)
        self.assertIn('"future":{"n":1.000}',changed)
        self.assertIn('"level":9007199254740995',changed)
        self.assertEqual(document.section(WORLD,rows[1]['path']),document.section(changed,rows[1]['path']))
        changed=characters.edit(changed,rows[1]['path'],{'backstory':'New'},rows[1]['raw'])
        self.assertIn('"Wisdom":9007199254740993',changed)

    def test_stale_record_and_invalid_path_or_types_rejected(self):
        row=characters.inspect(WORLD)['characters'][0]
        for path,changes,expected in [([],{'basicInfo':'x'},None),(row['path'],{'basicInfo':42},None),(row['path'],{'known':'yes'},None),(row['path'],{'name':'Renamed'},None),(row['path'],{'tier':'wrong'},None),(row['path'],{'personality':{'raw':'[1]'}},None),(row['path'],{'x':'custom'},None),(row['path'],{'basicInfo':'x'},'{}')]:
            with self.subTest(changes=changes),self.assertRaises(ValueError): characters.edit(WORLD,path,changes,expected)

    def test_create_missing_sections_and_duplicate_guard(self):
        world='{"heroesVersion":36,"future":1.000}'
        created=characters.create(world,'npc','  Guide  ')
        self.assertEqual(created['path'],['npcs','Guide'])
        with self.assertRaises(ValueError):characters.create(created['text'],'npc','Guide')
        premade=characters.create(created['text'],'premade','Mage')
        self.assertEqual(premade['path'],['premadeCharacters',0])
        self.assertEqual(len(characters.inspect(premade['text'])['characters']),2)
        self.assertIn('"future":1.000',premade['text'])

    def test_malformed_collections_warn_without_hiding_valid_people(self):
        result=characters.inspect('{"heroesVersion":36,"npcs":{"bad":7,"ok":{"name":"ok"}},"premadeCharacters":{}}')
        self.assertEqual(len(result['characters']),1)
        self.assertEqual(len(result['warnings']),2)
        with self.assertRaises(ValueError):characters.create('{"heroesVersion":36,"premadeCharacters":{}}','premade','Mage')

if __name__=='__main__':unittest.main()
