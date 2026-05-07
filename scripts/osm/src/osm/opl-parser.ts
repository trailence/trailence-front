import { OsmNode, OsmObject, OsmRelation, OsmRelationMember, OsmRelationMemberRole, OsmRelationMemberType, OsmWay } from './osm-object';

export interface ParseNodeOptions {
  includeTags: boolean;
}
export interface ParseWayOptions {
  includeTags: boolean;
  includeNodesIds: boolean;
}
export interface ParseRelationOptions {
  includeTags: boolean;
  includeNodes: boolean;
  includeWays: boolean;
  includeRelations: boolean;
  filterTags: {[key: string]: string[]} | undefined;
}

export function parseOpl(line: string, acceptNodes: ParseNodeOptions | undefined, acceptWays: ParseWayOptions | undefined, acceptRelations: ParseRelationOptions | undefined): OsmObject | undefined {
  const firstSep = line.indexOf(' ');
  if (firstSep < 0) return undefined;
  let id;
  try {
    id = BigInt(line.substring(1, firstSep));
  } catch (_) {
    return undefined;
  }
  if (Number.isNaN(id)) return undefined;
  const type = line.charCodeAt(0);
  switch (type) {
    case 110: // n
      if (!acceptNodes) return undefined;
      return parseOplNode(id, parseOplElements(line, firstSep), acceptNodes);
    case 114: // r
      if (!acceptRelations) return undefined;
      return parseOplRelation(id, parseOplElements(line, firstSep), acceptRelations);
    case 119: // w
      if (!acceptWays) return undefined;
      return parseOplWay(id, parseOplElements(line, firstSep), acceptWays);
  }
  return undefined;
}

function parseOplElements(line: string, firstSep: number): Map<string, string> {
  const elements = new Map<string, string>();
  const len = line.length;
  let i = firstSep + 1;
  while (i < len) {
    const type = line.charAt(i);
    const nextSep = line.indexOf(' ', i + 1);
    const value = line.substring(i + 1, nextSep > 0 ? nextSep : len);
    elements.set(type, value);
    if (nextSep < 0) break;
    i = nextSep + 1;
  }
  return elements;
}

function unescape(str: string): string {
  return str.replace(/%([0-9A-Fa-f]{1,6})%/g, (match, hex) => {
    try {
      const cp = Number.parseInt(hex, 16);
      if (Number.isNaN(cp)) return match;
      return String.fromCodePoint(cp);
    } catch {
      return match;
    }
  });
}

function parseTags(elements: Map<string, string>): {[key: string]: string} {
  const tagsElement = elements.get('T');
  const tags: {[key: string]: string} = {};
  if (!tagsElement) return tags;
  for (const tag of tagsElement.split(',')) {
    const i = tag.indexOf('=');
    if (i <= 0) continue;
    const key = unescape(tag.substring(0, i));
    const value = unescape(tag.substring(i + 1));
    tags[key] = value;
  }
  return tags;
}

function parseOplNode(id: bigint, elements: Map<string, string>, options: ParseNodeOptions): OsmNode | undefined {
  const xElement = elements.get('x');
  const yElement = elements.get('y');
  if (!xElement || !yElement) return undefined;
  const x = Number.parseFloat(xElement);
  const y = Number.parseFloat(yElement);
  if (Number.isNaN(x) || Number.isNaN(y)) {
    console.warn('Invalid node x/y: ', elements);
    return undefined;
  }
  const tags = options.includeTags ? parseTags(elements) : {};
  return new OsmNode(id, x, y, tags);
}

function parseOplWay(id: bigint, elements: Map<string, string>, options: ParseWayOptions): OsmWay | undefined {
  const nodesElement = elements.get('N');
  if (!nodesElement) return undefined;
  const nodes: bigint[] = [];
  if (options.includeNodesIds) {
    let i = 0;
    let l = nodesElement.length;
    while (i < l) {
      if (nodesElement.charCodeAt(i) !== 110) return undefined; // 'n'
      const nextSep = nodesElement.indexOf(',', i + 1);
      const id = nodesElement.substring(i + 1, nextSep < 0 ? l : nextSep);
      try {
        const nodeId = BigInt(id);
        nodes.push(nodeId);
      } catch (_) {
        return undefined;
      }
      if (nextSep < 0) break;
      i = nextSep + 1;
    }
    if (nodes.length < 2) return undefined;
    if (nodes.length > 65535) {
      console.warn('Way has too many nodes: ' + nodes.length);
      return undefined;
    }
  }
  const tags = options.includeTags ? parseTags(elements) : {};
  return new OsmWay(id, nodes, tags);
}

function parseOplRelation(id: bigint, elements: Map<string, string>, options: ParseRelationOptions): OsmRelation | undefined {
  const tags = options.includeTags || options.filterTags ? parseTags(elements) : {};
  if (options.filterTags) {
    for (const key of Object.keys(options.filterTags)) {
      const tag = tags[key];
      if (!tag) return undefined;
      if (!options.filterTags[key].includes(tag)) {
        const values = tag.split(';').map(s => s.trim()).filter(s => s.length > 0);
        if (!options.filterTags[key].some(v => values.includes(v)))
          return undefined;
      }
    }
  }
  const membersElement = elements.get('M');
  if (!membersElement) return undefined;
  const members: OsmRelationMember[] = [];
  let i = 0;
  let l = membersElement.length;
  while (i < l) {
    const typeLetter = membersElement.charCodeAt(i);
    const nextSep = membersElement.indexOf(',', i + 1);
    const member = membersElement.substring(i + 1, nextSep < 0 ? l : nextSep);
    const roleIndex = member.indexOf('@');
    if (roleIndex <= 0) return undefined;
    const idStr = member.substring(0, roleIndex).trim();
    const roleStr = member.substring(roleIndex + 1).trim().toLowerCase();
    let id: bigint;
    try {
      id = BigInt(idStr);
    } catch (_) {
      return undefined;
    }
    let type: OsmRelationMemberType | undefined = undefined;
    switch (typeLetter) {
      case 110: // n
        if (options.includeNodes) type = OsmRelationMemberType.NODE;
        break;
      case 114: // r
        if (options.includeRelations) type = OsmRelationMemberType.RELATION;
        break;
      case 119: // w
        if (options.includeWays) type = OsmRelationMemberType.WAY;
        break;
    }
    if (type !== undefined) {
      let role: OsmRelationMemberRole | undefined = undefined;
      let skip = false;
      switch (roleStr) {
        case 'forward': role = OsmRelationMemberRole.FORWARD; break;
        case 'backward': role = OsmRelationMemberRole.BACKWARD; break;
        case 'excursion': role = OsmRelationMemberRole.EXCURSION; break;
        case '': case 'main': break;
        case 'alternative': case 'approach': case 'connection':
          skip = true;
          break;
        //default: console.log('unknown role', roleStr);
        /*
        case 'left': case 'right':
        case 'north': case 'south': case 'west': case 'east':
        case 'clockwise': case 'anticlockwise':
        case '':
          break;
        default: console.log('Unknown role', roleStr);
        */
      }
      if (!skip)
        members.push({type, id, role});
    }
    if (nextSep < 0) break;
    i = nextSep + 1;
  }
  return new OsmRelation(id, members, options.includeTags ? tags : {});
}
