export interface ImageSelected {
	readonly type: "image.selected";
	readonly imageId: string;
}

export type CatalogEvent = ImageSelected;
