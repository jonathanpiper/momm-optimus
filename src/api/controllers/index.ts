import { Request, Response } from "express"
import { downloadFile, logger } from "../../utils/helper.js"
import fs from "fs"
import type { Rail, Dwell, Content, Item, InlineAudioClip, StoryMedia, MediaItem, ArtifactImage } from "../../types/index.js"
import appRootPath from "app-root-path"
import { homedir, ssh } from "../../utils/ssh.js"
import isDocker from "is-docker"
import "dotenv/config"
import { createClient } from "@sanity/client"
import { FetchCompleteRailByIdentifier } from "../queries/FetchCompleteRailByIdentifier.js"
import { FetchRailConfig } from "../queries/FetchRailConfig.js"

let mediaDir: string
let filesNeeded: string[] = []

const galleriesArray = ["gallery1", "gallery2", "gallery4"]

const IMAGE_URL_PREFIX = process.env.PRODUCTION_IMAGE_URL || ""
const MEDIA_URL_PREFIX = process.env.PRODUCTION_FILE_URL || ""
let MEDIA_DIR_PREFIX = `${appRootPath.path}/files/`

const convertDirToTransferObject = (dirToRead: string, remotePath: string, exclusions?: string[]): { local: string; remote: string }[] => {
    const files = fs.readdirSync(dirToRead)
    const filesForSSHTransfer = files
        .filter((f: string) => {
            if (exclusions) {
                return f.substring(0) !== "." && exclusions.indexOf(f) === -1
            } else {
                return f.substring(0) !== "."
            }
        })
        .map((f: string) => {
            return { local: `${dirToRead}/${f}`, remote: `${remotePath}/${f}` }
        })
    return filesForSSHTransfer
}

const transferFilesToRailComputer = async (railDefinition: { hostname: string; ip: string }) => {
    let returnValue: string = ""
    if (fs.readdirSync(`${MEDIA_DIR_PREFIX}${railDefinition.hostname}`).length === 0) {
        logger.warn(`Attempted to deploy rail ${railDefinition.hostname} without any files present.`)
        returnValue = "noFilesPresent"
    } else {
        try {
            await ssh.connect({
                host: railDefinition.ip,
                username: process.env.RAILADMIN_USERNAME,
                privateKeyPath: isDocker() ? "/app/privatekeys/id_ed25519" : `${homedir}/.ssh/id_ed25519`,
            })

            const remoteFileList = (await ssh.exec(`ls`, [`${process.env.REMOTE_PATH}/files`])).split("\n").filter((f: string) => {
                return f.indexOf(".json") === -1
            })

            const localFiles = convertDirToTransferObject(`${MEDIA_DIR_PREFIX}${railDefinition.hostname}`, `${process.env.REMOTE_PATH}/files`, remoteFileList)
            const globalFiles = convertDirToTransferObject(`${MEDIA_DIR_PREFIX}global`, `${process.env.REMOTE_PATH}/files`)
            const filesForTransfer = [...localFiles, ...globalFiles]

            await ssh.putFiles(filesForTransfer).then(
                () => {
                    returnValue = "success"
                    logger.info(`Files transfered to ${railDefinition.hostname} computer.`)
                },
                (error) => {
                    returnValue = "transferFailed"
                    logger.error(error)
                }
            )
        } catch (err) {
            returnValue = "failure"
            logger.error(err)
        }
    }
    return returnValue
}

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
    logger.info(media)
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

const sanityColorToRGB = (sanityColorObject: any) => {
    const rgb = sanityColorObject.rgb
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
}

const createConfigurationObject = (incomingConfigObject: any) => {
    const transformConfigObject: any = {
        gallery1: {},
        gallery2: {},
        gallery4: {},
        "dr-title-font": incomingConfigObject.drTitleFont,
        "dr-body-font": incomingConfigObject.drBodyFont,
    }
    galleriesArray.forEach((g) => {
        transformConfigObject[g].color = sanityColorToRGB(incomingConfigObject[g].color)
        transformConfigObject[g].activeColor = sanityColorToRGB(incomingConfigObject[g].activeColor)
        if (incomingConfigObject[g].hasOwnProperty("dateRangeColor")) {
            transformConfigObject[g].dateRangeColor = sanityColorToRGB(incomingConfigObject[g].dateRangeColor)
        }
    })
    return transformConfigObject
}

export const status = async (req: Request, res: Response) => {
    res.status(200).send("Optimus is online. 🚀")
}

export const deploy = async (req: Request, res: Response) => {
    if (!req.body.railIdentifier) {
        res.status(400).send("Malformed or missing rail identifier.")
        logger.warn(`Received invalid or missing rail identifier.`)
        return
    }
    const railIdentifier = req.body.railIdentifier
    const DREX_URL = process.env.DREX_SERVER_URL
    let railsConfig
    try {
        const railsReq = await fetch(`${DREX_URL}rails`)
        railsConfig = await railsReq.json()
    } catch (err) {
        logger.error(err)
        res.status(500).send(`Could not reach DREX server. Please very it is available at ${DREX_URL}.`)
        return
    }
    const railDefinition = railsConfig.filter((r: any) => r.name === railIdentifier)[0]
    if (!railDefinition) {
        res.status(500).send(`Could not locate a rail with identifier ${railIdentifier}.`)
        logger.error(`Could not locate rail definition with identifier ${railIdentifier}.`)
        return
    }
    const transferStatus: string = await transferFilesToRailComputer(railDefinition.controlDevice)
    switch (transferStatus) {
        case "noFilesPresent":
            res.status(500).send(`No files found for ${railIdentifier}; has a step been missed?`)
            break
        case "railConnectionError":
            res.status(500).send(`Couldn't connect to rail ${railIdentifier}. Verify SSH access from Railhub.`)
            break
        case "transferFailed":
            res.status(500).send(`Couldn't transfer files to rail ${railIdentifier}. Verify SSH access from Railhub.`)
            break
        case "success":
            res.status(200).send(`Files successfully copied to ${railIdentifier} computer.`)
            break
        default:
            res.status(500).send(`Unknown error transferring to ${railIdentifier}. Please check logs for more details.`)
            break
    }
}

export const preview = async (req: Request, res: Response) => {
    if (!req.params.identifier) {
        res.status(400).send("No identifier specified.")
        return
    }
    if (req.params.identifier.substring(0, 4) !== "rail") {
        res.status(400).send("Identifier must be in format rail(Gallery)(Position)(Subposition), e.g. 'rail1a1' or 'rail2e'.")
        return
    }
    const identifier = req.params.identifier
    const client = createClient({
        projectId: "4udqswqp",
        dataset: "production",
        useCdn: false,
        apiVersion: "2023-10-06",
    })
    const config = await client.fetch(FetchRailConfig)
    const configResult = createConfigurationObject(config)
    const railResult = await client.fetch(FetchCompleteRailByIdentifier, { id: identifier })
    railResult.content.map((content: Content) => {
        if (content._type === "stories") {
            content.items = content.items.map((item: Item) => {
                item.storyMedia = item.storyMedia
                    ? item.storyMedia.map((media: StoryMedia, i: number) => {
                          if (media.image) {
                              media.full = media.image
                              media.thumbnail = media.image + "?h=200"
                              delete media.image
                          }
                          return media
                      })
                    : []
                return item
            })
        }
        if (content._type === "media") {
            content.items = content.items.filter((item: Item) => {
                if (item) return item
            })
        }
    })
    res.status(200).send({ config: configResult, rail: railResult })
}

export const transform = async (req: Request, res: Response) => {
    if (!fs.existsSync(MEDIA_DIR_PREFIX)) {
        fs.mkdirSync(MEDIA_DIR_PREFIX)
    }
    try {
        const railResult = req.body.rail
        const incomingConfigResult = req.body.config

        if (!railResult) {
            logger.warn("No incoming rail content detected.")
            res.status(400).send("Malformed or incomplete rail content.")
            return
        }

        if (!incomingConfigResult) {
            logger.warn("No incoming configuration detected.")
            res.status(400).send("Malformed or incomplete rail configuration.")
            return
        }

        const configResult = createConfigurationObject(incomingConfigResult)

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
                            content.items
                                .filter((i) => i !== null)
                                .map(async (category: Item) => {
                                    if (!category?.heroImage) throw `No hero image defined for media category ${category._type}.`
                                    category.heroImage = category.heroImage
                                        ? await shrinkAndDownload({
                                              media: category.heroImage,
                                          })
                                        : ""
                                    category.items = category.items
                                        ? await Promise.all(
                                              category.items.map(async (item: MediaItem) => {
                                                  if (item === null || !item.clip) throw `Malformed item definition in ${category._type}.`
                                                  if (item.thumbnail) {
                                                      item.thumbnail = await shrinkAndDownload({
                                                          media: item.thumbnail,
                                                          flag: "thumbnail",
                                                      })
                                                  }
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
                                              logger.info(`Debugging null image. ${item.artifactNumber}, ${image.image}`)
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
                fs.chmod(`${mediaDir}rail.json`, 0o644, () => {})
                logger.info(`Rail definition for ${railResult.identifier} written to rail.json.`)
            })
            fs.writeFile(`${mediaDir}config.json`, JSON.stringify(configResult), (err) => {
                if (err) throw err
                fs.chmod(`${mediaDir}config.json`, 0o644, () => {})
                logger.info(`Configuration for ${railResult.identifier} written to config.json.`)
            })
            fs.readdir(mediaDir, (err, files) => {
                const filesToRemove: string[] = files.filter((n: string) => {
                    return !filesNeeded.includes(`${mediaDir}${n}`) && ![`rail.json`, `config.json`].includes(n)
                })
                filesToRemove.forEach((n: string) => {
                    logger.info(`${n} is no longer needed, deleting.`)
                    fs.unlinkSync(`${mediaDir}${n}`)
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
}
