export interface TowerBuffMeta {
  name: string;
  description: string;
}

export interface TowerRulesSourceFile {
  size: number;
  sha256: string;
}

export interface TowerRulesData {
  floorCount: number;
  finalFloor: number;
  finalTemplateId: number;
  source: {
    staticVersion: string;
    url: string;
    md5: string;
    size: number;
    files: Record<string, TowerRulesSourceFile>;
  };
}
