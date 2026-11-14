import {PART_DEFINITIONS as D} from './partDefinitions.js';

// Source artwork does not always reach the logical attachment edge. A small
// overlap at snapped joins closes those visual seams without scaling the art.
const ATTACHMENT_OVERLAP = 0.55;

function rotatedSize(def, rotation = 0) {
	const cos = Math.abs(Math.cos(rotation));
	const sin = Math.abs(Math.sin(rotation));
	return {
		width: def.width * cos + def.height * sin,
		height: def.width * sin + def.height * cos
	};
}

export function attachmentSlots(type, other, rotation = 0) {
	const partDef = D[type], otherDef = D[other.type];
	if (!partDef || !otherDef) return [];
	const partSize = rotatedSize(partDef, rotation);
	const otherSize = rotatedSize(otherDef, other.rotation);
	return [
		{x: other.x, y: other.y - (partSize.height + otherSize.height) / 2 + ATTACHMENT_OVERLAP},
		{x: other.x, y: other.y + (partSize.height + otherSize.height) / 2 - ATTACHMENT_OVERLAP},
		{x: other.x - (partSize.width + otherSize.width) / 2 + ATTACHMENT_OVERLAP, y: other.y},
		{x: other.x + (partSize.width + otherSize.width) / 2 - ATTACHMENT_OVERLAP, y: other.y}
	];
}

export function snapPart(part, parts, tolerance = 0.65) {
	let best = null;
	for (const other of parts) {
		if (other === part) continue;
		for (const slot of attachmentSlots(part.type, other, part.rotation)) {
			const dist = Math.hypot(part.x - slot.x, part.y - slot.y);
			if (dist < tolerance && (!best || dist < best.dist)) best = {...slot, dist};
		}
	}
	if (!best) return false;
	part.x = best.x;
	part.y = best.y;
	return true;
}
