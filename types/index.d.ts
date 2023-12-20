export interface Rail {
    identifier: string
    dwell: Dwell
    content: Content[]
  }
  
  export interface Dwell {
    images: string[]
  }
  
  export interface Content {
    _type: string
    title: string
    icon: string
    items: Item[]
  }
  
  export interface Item {
    inlineAudioClip?: InlineAudioClip
    title?: string
    body?: string
    heroImage?: string
    storyMedia?: StoryMedia[]
    _type?: string
    items?: MediaItem[]
    summary: any
    maker?: string
    date?: string
    artifactImages?: ArtifactImage[]
    description?: string
    artifactNumber?: string
    credit?: string
  }
  
  export interface InlineAudioClip {
    label: string
    clip: string
  }
  
  export interface StoryMedia {
    caption: string
    full?: string
    image?: string
    video?: string
    thumbnail?: string
  }
  
  export interface MediaItem {
    title: string
    caption?: string
    thumbnail:  string
    clip:  string
    summary?: string
    credit?: string
    artist?: string
    instrument?: string
  }
  
  export interface ArtifactImage {
    image: string
    width: number
    height: number
  }
  