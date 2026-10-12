export const relationshipRules=[
 {section:'npcs',field:'currentLocation',target:'locations'},
 {section:'npcs',field:'faction',target:'factions'},
 {section:'locations',field:'region',target:'regions'},
 {section:'regions',field:'realm',target:'realms'},
] as const;
