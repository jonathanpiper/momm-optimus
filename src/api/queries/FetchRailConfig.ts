import groq from 'groq'

export const FetchRailConfig = groq`(
    *[ _type == 'railConfig'][0]
)`