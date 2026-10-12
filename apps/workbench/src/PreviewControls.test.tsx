import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PublicationPreview} from './PublicationPreview';
import {ImageInspection} from './ImageInspection';

test('publication editing shows copy and an explicit full-screen launcher, not squeezed public layouts',()=>{
 const previous=globalThis.matchMedia;
 globalThis.matchMedia=query=>({matches:true,media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
 try{
  const markup=renderToStaticMarkup(<PublicationPreview source={'{"title":"Test world","description":"<script>unsafe</script>","advancedDescription":"Long copy","image":"https://example.com/cover.png","initialGameState":{}}'} saveName="Fallback" onNavigate={()=>{}}/>);
  assert.ok(markup.includes('Open full-screen preview'));
  assert.ok(markup.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
  assert.ok(!markup.includes('class="publication-site-previews'));
  assert.ok(!markup.includes('<script>'));
  assert.ok(markup.includes('Edit short copy'));
  assert.ok(markup.includes('Edit long copy'));
  assert.ok(markup.includes('Inspect full size'));
 }finally{globalThis.matchMedia=previous;}
});

test('image galleries keep their thumbnails and expose explicit full-size inspection',()=>{
 const markup=renderToStaticMarkup(<ImageInspection url="https://example.com/evidence.png" name="thumbnail evidence"><img src="https://example.com/evidence.png" alt="Thumbnail"/></ImageInspection>);
 assert.ok(markup.includes('alt="Thumbnail"'));
 assert.ok(markup.includes('aria-label="Inspect thumbnail evidence full size"'));
 assert.ok(!markup.includes('<dialog'));
});
