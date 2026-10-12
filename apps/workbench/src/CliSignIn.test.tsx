import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {CliSignIn} from './CliSignIn';

test('native Claude sign-in offers each native authentication method and states credential limits',()=>{
 const markup=renderToStaticMarkup(<CliSignIn profileId="claude" prepare={async()=>{}} onRefresh={async()=>{}}/>);
 for(const text of ['Sign in with Claude account','Sign in with Console','Sign in with SSO','Keystore-encrypted','temporary private credential files','no automatic API fallback','Forget CLI sign-in'])assert(markup.includes(text),text);
 assert(!markup.includes('Authorization code'));
 assert(!markup.includes('href='));
});
test('native Cursor sign-in names the official SDK and explains expiring keys and remote revocation',()=>{
 const markup=renderToStaticMarkup(<CliSignIn protocol="cursor" profileId="cursor" prepare={async()=>{}} onRefresh={async()=>{}}/>);
 for(const text of ['Sign in with Cursor','official Cursor SDK','expiring user API key','no on-disk login store','Keystore-encrypted','revoke it in Cursor','no automatic API fallback'])assert(markup.includes(text),text);
 for(const text of ['Sign in with Claude','Sign in with Console','Sign in with SSO','Authorization code','temporary private credential files'])assert(!markup.includes(text),text);
});
