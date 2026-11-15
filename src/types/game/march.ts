export type BasicResourceType = 'wood' | 'food' | 'stone' | 'iron';

export type RouteType = 'toTargetRallyPve' | 'returnToOutpost' | string;

export type MineTypesMap = Record<string, BasicResourceType>;

export type RallyTargetsMap = Record<string, string>;

export type RouteSpeedsMap = Record<string, number>;
