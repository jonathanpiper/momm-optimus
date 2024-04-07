import groq from 'groq'

export const FetchCompleteRailByIdentifier = groq`(
    *[ identifier == $id ][0]
    {
        identifier,
        title,
        body,
        "dwell": {
                "images": dwellImages[].asset->url
        },
        content[] {
            _type=='stories' => {
                _type,
                title, 
                "icon": icon.asset->url,
                items[]->{
                    title,
                    body,
                    "heroImage": heroImage.asset->url,
                    storyMedia[]
                    {
                        _type == "storyImage" => {
                            caption,
                            "image": asset->url
                        },
                        _type == "storyVideo" => {
                            caption,
                            "video": asset->url,
                            "thumbnail": thumbnail.asset->url
                        }
                    },
                    inlineAudioClip != null => {
                        inlineAudioClip {
                            label,
                            "clip": asset->url
                        }
                    }
                }
            },
            _type=='media' => {
                _type,
                title, 
                "icon": icon.asset->url,
                (custom != true) => {
                "items": [
                musicalMoments{
                    "_type": "musicalMoments",
                    "title": "Musical Moments",
                    "heroImage": heroImage.asset->url,
                    "items": clips[]->
                    {
                        title,
                        artist,
                        instrument,
                        credit,
                        "thumbnail": thumbnail.asset->url,
                        "clip": media.asset->url
                    },
                    summary
                },
                oralHistories{
                    "_type": "oralHistories",
                    "title": "Oral Histories",
                    "heroImage": heroImage.asset->url,
                    "items": 
                    clips[]->
                    {
                        title,
                        summary,
                        "thumbnail": thumbnail.asset->url,
                        "clip": media.asset->url
                    }
                },
                factoryFootage{
                    "_type": "factoryFootage",
                    "title": "Factory Footage",
                    "heroImage": heroImage.asset->url,
                    "items": 
                    clips[]->
                    {
                        title,
                        caption,
                        "thumbnail": thumbnail.asset->url,
                        "clip": media.asset->url
                    }
                }
                ],
                },
                (custom == true) => {
                    "items": customMediaClips.clips[]->{
                        "_type": "custom",
                        title,
                        "heroImage": heroImage.asset->url,
                        "items": [{
                            label,
                            "clip": media.asset->url
                        }]
                    }},
            },
            _type=='artifacts' => {
                _type,
                title, "icon": icon.asset->url,
                items[]->{
                    description, 
                    artifactNumber, 
                    title, 
                    credit, 
                    maker, 
                    date,
                    artifactImages[]{
                        "image": asset->url,
                        "width": asset->metadata.dimensions.width,
                        "height": asset->metadata.dimensions.height
                    }
                }
            }
        }
    }
)`