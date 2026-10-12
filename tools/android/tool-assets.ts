import {writeFileSync} from 'node:fs';import {toolDefinitions} from '../../hosts/desktop/codex';
for(const work of [true,false])writeFileSync('android/app/src/main/assets/tools-'+(work?'work':'plan')+'.json',JSON.stringify(toolDefinitions(work)));
