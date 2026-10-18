export type Theme = 'dark'|'light'|'system';
export type NavigationPreferences = {order:string[];desktop:string[];mobile:string[]};
export const navigationStorageKey='voyage-navigation-v1';
export const shortcutLimits={desktop:6,mobile:4};
const desktopDefaults=['editor','map','characters','plan','review','artwork'];
const mobileDefaults=['editor','map','mods','publish'];

export function normalizeNavigation(value:unknown,toolIds:readonly string[]):NavigationPreferences {
 const stored=value&&typeof value==='object'?value as Partial<NavigationPreferences>:{};
 const valid=(items:unknown)=>Array.isArray(items)?[...new Set(items.filter((id):id is string=>typeof id==='string'&&toolIds.includes(id)))]:[];
 const order=valid(stored.order);
 return {order:order.concat(toolIds.filter(id=>!order.includes(id))),desktop:valid(Array.isArray(stored.desktop)?stored.desktop:desktopDefaults).slice(0,shortcutLimits.desktop),mobile:valid(Array.isArray(stored.mobile)?stored.mobile:mobileDefaults).slice(0,shortcutLimits.mobile)};
}

export function readNavigation(storage:Pick<Storage,'getItem'>,toolIds:readonly string[]) {
 try{return normalizeNavigation(JSON.parse(storage.getItem(navigationStorageKey)||'null'),toolIds);}catch{return normalizeNavigation(null,toolIds);}
}

export function readTheme(storage:Pick<Storage,'getItem'>):Theme {
 try{const value=storage.getItem('voyage-theme');return value==='light'||value==='system'?value:'dark';}catch{return 'dark';}
}

export function moveTool(preferences:NavigationPreferences,id:string,direction:-1|1):NavigationPreferences {
 const index=preferences.order.indexOf(id),destination=index+direction;
 if(index<0||destination<0||destination>=preferences.order.length)return preferences;
 const order=preferences.order.slice();
 [order[index],order[destination]]=[order[destination],order[index]];
 return {...preferences,order};
}

export function toggleShortcut(preferences:NavigationPreferences,surface:'desktop'|'mobile',id:string):NavigationPreferences {
 if(!preferences.order.includes(id))return preferences;
 const shortcuts=preferences[surface];
 if(shortcuts.includes(id))return {...preferences,[surface]:shortcuts.filter(tool=>tool!==id)};
 if(shortcuts.length>=shortcutLimits[surface])return preferences;
 return {...preferences,[surface]:shortcuts.concat(id)};
}
