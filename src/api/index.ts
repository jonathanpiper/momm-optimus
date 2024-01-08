import express from "express"
const router = express.Router()
import { downloadFile, logger } from "../utils/helper.js"
import * as url from "url"
const __dirname = url.fileURLToPath(new URL(".", import.meta.url))
import fs from "fs"
import type { Rail, Dwell, Content, Item, InlineAudioClip, StoryMedia, MediaItem, ArtifactImage } from "../types/index.js"

let mediaDir: string
let filesNeeded: string[] = []

const IMAGE_URL_PREFIX = process.env.PRODUCTION_IMAGE_URL || ''
const MEDIA_URL_PREFIX = process.env.PRODUCTION_FILE_URL || ''
let MEDIA_DIR_PREFIX = `${__dirname}files/`

const shrinkAndDownload = async ({ media, flag = "", height }: { media: string; flag?: string; height?: number }) => {
    let query: string = ""
    let extension: string = ""
    switch (flag) {
        case "thumbnail":
            query = "?h=200"
            break
        case "artifact":
            if (!height) break
            await shrinkAndDownload({
                media: media,
                flag: "threequarter",
                height: height,
            })
            await shrinkAndDownload({ media: media, flag: "half", height: height })
            await shrinkAndDownload({ media: media, flag: "quarter", height: height })
            break
        case "threequarter":
            if (!height) break
            query = `?h=${Math.floor(height * 0.75)}`
            break
        case "half":
            if (!height) break
            query = `?h=${Math.floor(height * 0.5)}`
            break
        case "quarter":
            if (!height) break
            query = `?h=${Math.floor(height * 0.25)}`
            break
        default:
    }
    try {
        extension = media.substring(media.lastIndexOf("."))
    } catch (err) {
        logger.warn("Could not parse media string.", err)
    }
    let localMediaPath = [".jpg", ".svg", ".png"].includes(extension) ? media.replace(IMAGE_URL_PREFIX, "") : media.replace(MEDIA_URL_PREFIX, "")
    localMediaPath =
        ["", "artifact"].indexOf(flag) === -1 ? localMediaPath.substring(0, localMediaPath.indexOf(extension)) + "_" + flag + extension : localMediaPath
    filesNeeded.push(`${mediaDir}${localMediaPath}`)
    try {
        await downloadFile(`${media}${query}`, `${mediaDir}${localMediaPath}`)
        return localMediaPath
    } catch (err) {
        logger.error(err)
        return ""
    }
}

router.post("/deploy", async (req, res) => {
    console.log(req.body)
})

router.post("/api/transform", async (req, res) => {
    if (!fs.existsSync(MEDIA_DIR_PREFIX)) {
        fs.mkdirSync(MEDIA_DIR_PREFIX)
    }
    try {
        const { railResult }: { railResult: Rail } = req.body

        if (!railResult) {
            logger.warn("No incoming rail content detected.")
            res.status(400).send("Malformed or incomplete rail content.")
            return
        }

        try {
            mediaDir = MEDIA_DIR_PREFIX + `${railResult.identifier}/`
            if (!fs.existsSync(mediaDir)) {
                fs.mkdirSync(mediaDir)
            }
        } catch (err) {
            logger.error(`Could not initialize local directory ${mediaDir}`)
            res.status(500).send(`Could not initialize local directory on server. Error: ${err}`)
            return
        }

        try {
            railResult.dwell.images = await Promise.all(
                railResult.dwell.images.map(async (img: string) => {
                    const path = await shrinkAndDownload({
                        media: img,
                    })
                    return typeof path === "string" ? path : ""
                })
            )

            railResult.content = await Promise.all(
                railResult.content.map(async (content: Content) => {
                    if (!content.icon) throw `No icon defined for section ${content.title}.`
                    content.icon = await shrinkAndDownload({
                        media: content.icon,
                    })
                    if (content.items.length === 0) throw `No content defined for ${content.title}.`
                    if (content._type === "stories") {
                        content.items = await Promise.all(
                            content.items.map(async (item: Item) => {
                                if (!item.heroImage) throw `No hero image defined for ${item.title}.`
                                item.heroImage = item.heroImage
                                    ? await shrinkAndDownload({
                                          media: item.heroImage,
                                      })
                                    : ""
                                if (item.storyMedia?.length === 0) throw `Story ${item.title} has no media defined.`
                                item.storyMedia = item.storyMedia
                                    ? await Promise.all(
                                          item.storyMedia.map(async (media: StoryMedia, i: number) => {
                                              if (media.image) {
                                                  media.full = await shrinkAndDownload({
                                                      media: media.image,
                                                  })
                                                  media.thumbnail = await shrinkAndDownload({
                                                      media: media.image,
                                                      flag: "thumbnail",
                                                  })
                                                  delete media.image
                                              } else if (media.video && media.thumbnail) {
                                                  media.video = await shrinkAndDownload({
                                                      media: media.video,
                                                  })
                                                  media.thumbnail = await shrinkAndDownload({
                                                      media: media.thumbnail,
                                                      flag: "thumbnail",
                                                  })
                                              } else {
                                                  throw `Story media item ${media.caption} not correctly defined.`
                                              }
                                              return media
                                          })
                                      )
                                    : []
                                if (item.inlineAudioClip) {
                                    item.inlineAudioClip.clip = await shrinkAndDownload({
                                        media: item.inlineAudioClip.clip,
                                    })
                                }
                                return item
                            })
                        )
                    }
                    if (content._type === "media") {
                        content.items = await Promise.all(
                            content.items.map(async (category: Item) => {
                                if (category === null) throw `Missing content definition in ${content.title}.`
                                if (!category?.heroImage) throw `No hero image defined for media category ${category._type}.`
                                category.heroImage = category.heroImage
                                    ? await shrinkAndDownload({
                                          media: category.heroImage,
                                      })
                                    : ""
                                category.items = category.items
                                    ? await Promise.all(
                                          category.items.map(async (item: MediaItem) => {
                                              if (item === null || !item.thumbnail || !item.clip) throw `Malformed item definition in ${category._type}.`
                                              item.thumbnail = await shrinkAndDownload({
                                                  media: item.thumbnail,
                                                  flag: "thumbnail",
                                              })
                                              item.clip = await shrinkAndDownload({
                                                  media: item.clip,
                                              })
                                              return item
                                          })
                                      )
                                    : []
                                return category
                            })
                        )
                    }
                    if (content._type === "artifacts") {
                        content.items = await Promise.all(
                            content.items.map(async (item: Item) => {
                                if (item === null) throw `Malformed artifact definition.`
                                if (item.artifactImages?.length === 0) throw `Artifact ${item.artifactNumber} has no images.`
                                item.artifactImages = item.artifactImages
                                    ? await Promise.all(
                                          item.artifactImages.map(async (image: ArtifactImage, i: number) => {
                                              image.image = await shrinkAndDownload({
                                                  media: image.image,
                                                  flag: "artifact",
                                                  height: image.height,
                                              })
                                              return image
                                          })
                                      )
                                    : []
                                return item
                            })
                        )
                    }
                    return content
                })
            )
            logger.info(`Rail definition transformed for local files, ${filesNeeded.length} files stored.`)
        } catch (err) {
            logger.error(err)
            res.status(500).send(`Could not process incoming rail definition. Error: ${err}`)
            return
        }

        try {
            fs.writeFile(`${mediaDir}rail.json`, JSON.stringify(railResult), (err) => {
                if (err) throw err
                filesNeeded.push(`${mediaDir}rail.json`)
                logger.info(`Rail definition for ${railResult.identifier} written to rail.json.`)
                fs.readdir(mediaDir, (err, files) => {
                    const filesToRemove: string[] = files.filter((n: string) => {
                        return !filesNeeded.includes(`${mediaDir}${n}`)
                    })
                    filesToRemove.forEach((n: string) => {
                        logger.info(`${n} is no longer needed, deleting.`)
                        fs.unlinkSync(`${mediaDir}${n}`)
                    })
                })
            })
        } catch (err) {
            res.status(500).send(`Could not clean up local directory. Error: ${err}`)
            return
        }

        res.status(200).send(
            `Rail definition for ${railResult.identifier} successfully created and assets downloaded to local directory. Result: ${railResult}`
        )
    } catch (err) {
        logger.error(`Could not complete rail distribution. Error: ${err}`)
        res.status(500).send(`Unable to prepare rail distribution. Error: ${err}`)
    }
})
