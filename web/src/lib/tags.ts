export type Tag = {
	did: string;
	handle: string;
	title: string;
	direction: -2 | -1 | 1 | 2;
	adjective: string;
};

const DIRECTION_PHRASES: Record<Tag['direction'], string> = {
	2: 'is really',
	1: 'is',
	[-1]: 'is not',
	[-2]: "really isn't"
};

export function directionPhrase(direction: Tag['direction']): string {
	return DIRECTION_PHRASES[direction];
}
