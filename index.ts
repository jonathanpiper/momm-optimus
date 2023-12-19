import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";
import { downloadFile } from "./helper.js";
import { emptyDirSync } from "fs-extra";
import { createServer } from "http";
import type { Rail, Dwell, Content, Item, InlineAudioClip, StoryMedia, MediaItem, ArtifactImage } from "./types/index.js";
// import WebSocket, {WebSocketServer} from 'ws'
// import {v4 as uuidv4} from 'uuid'
// import {Server} from 'socket.io'
import * as url from "url";
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

const app = express();
const server = createServer(app);
// const ws = new WebSocketServer({server})
// const clients = {}
// ws.on('connection', (connection) => {
//     const userId = uuidv4()
//     console.log(`Recieved a new connection.`)
//     clients[userId] = connection
//     console.log(`${userId} connected.`)
// })

server.listen(3000);

const IMAGE_URL_PREFIX = "https://cdn.sanity.io/images/4udqswqp/production/";
const MEDIA_URL_PREFIX = "https://cdn.sanity.io/files/4udqswqp/production/";
let MEDIA_DIR_PREFIX = `${__dirname}files/`;
let mediaDir: string;

if (!fs.existsSync(MEDIA_DIR_PREFIX)) {
    fs.mkdirSync(MEDIA_DIR_PREFIX);
}

app.use(cors());
app.use(bodyParser.json());

app.get("/status", (req, res) => {
    res.send("Online");
});

const shrinkAndDownload = async ({ media, name, flag = "", height }: { media: string; name: string; flag?: string; height?: number }) => {
    let query: string = "";
    let extension: string = "";
    switch (flag) {
        case "thumbnail":
            query = "?h=200";
            break;
        case "artifact":
            if (!height) break;
            await shrinkAndDownload({
                media: media,
                name: name,
                flag: "threequarter",
                height: height,
            });
            await shrinkAndDownload({ media: media, name: name, flag: "half", height: height });
            await shrinkAndDownload({ media: media, name: name, flag: "quarter", height: height });
            break;
        case "threequarter":
            if (!height) break;
            query = `?h=${Math.floor(height * 0.75)}`;
            break;
        case "half":
            if (!height) break;
            query = `?h=${Math.floor(height * 0.5)}`;
            break;
        case "quarter":
            if (!height) break;
            query = `?h=${Math.floor(height * 0.25)}`;
            break;
        default:
    }
    try {
        extension = media.substring(media.lastIndexOf("."));
    } catch (err) {
        console.log("Could not parse media string.", err);
    }
    let localMediaPath = [".jpg", ".svg", ".png"].includes(extension) ? media.replace(IMAGE_URL_PREFIX, "") : media.replace(MEDIA_URL_PREFIX, "");
    localMediaPath = name ? `${name.replace(/[^A-Z0-9]/gi, "_").toLowerCase()}${localMediaPath.substring(localMediaPath.indexOf(extension))}` : localMediaPath;
    localMediaPath =
        ["", "artifact"].indexOf(flag) === -1 ? localMediaPath.substring(0, localMediaPath.indexOf(extension)) + "_" + flag + extension : localMediaPath;
    try {
        await downloadFile(`${media}${query}`, `${mediaDir}${localMediaPath}`);
        return localMediaPath;
    } catch (err) {
        console.log(err);
        return "";
    }
};

app.post("/api/transform", async (req, res) => {
    const { railResult }: { railResult: Rail } = req.body;

    if (!railResult) {
        console.warn("No incoming rail content detected.");
        res.status(400).send("Malformed or incomplete rail content.");
        return;
    }

    mediaDir = MEDIA_DIR_PREFIX + `${railResult.identifier}/`;
    if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir);
    } else {
        emptyDirSync(mediaDir);
    }

    railResult.dwell.images = await Promise.all(
        railResult.dwell.images.map(async (img: string, i: number) => {
            const path = await shrinkAndDownload({ media: img, name: `dwell-${i + 1}` });
            return typeof path === "string" ? path : "";
        })
    );

    railResult.content = await Promise.all(
        railResult.content.map(async (content: Content) => {
            content.icon = await shrinkAndDownload({
                media: content.icon,
                name: `icon-${content._type}`,
            });
            if (content._type === "stories") {
                content.items = await Promise.all(
                    content.items.map(async (item: Item) => {
                        item.heroImage = item.heroImage
                            ? await shrinkAndDownload({
                                  media: item.heroImage,
                                  name: `${item.title}`,
                              })
                            : "";
                        item.storyMedia = item.storyMedia
                            ? await Promise.all(
                                  item.storyMedia.map(async (media: StoryMedia, i: number) => {
                                      if (media.image) {
                                          media.full = await shrinkAndDownload({
                                              media: media.image,
                                              name: `${item.title}-${i + 1}`,
                                          });
                                          media.thumbnail = await shrinkAndDownload({
                                              media: media.image,
                                              name: `${item.title}-${i + 1}`,
                                              flag: "thumbnail",
                                          });
                                          delete media.image;
                                      } else if (media.video && media.thumbnail) {
                                          media.video = await shrinkAndDownload({
                                              media: media.video,
                                              name: `${item.title}-${i + 1}`,
                                          });
                                          media.thumbnail = await shrinkAndDownload({
                                              media: media.thumbnail,
                                              name: `${item.title}-${i + 1}`,
                                              flag: "thumbnail",
                                          });
                                      } else {
                                          console.log(`Story media item ${media.caption} not correctly defined.`);
                                      }
                                      return media;
                                  })
                              )
                            : [];
                        if (item.inlineAudioClip) {
                            item.inlineAudioClip.clip = await shrinkAndDownload({
                                media: item.inlineAudioClip.clip,
                                name: `${item.title}_audio`,
                            });
                        }
                        return item;
                    })
                );
            }
            if (content._type === "media") {
                content.items = await Promise.all(
                    content.items.map(async (category: Item) => {
                        category.heroImage = category.heroImage
                            ? await shrinkAndDownload({
                                  media: category.heroImage,
                                  name: `${category._type}`,
                              })
                            : "";
                        category.items = category.items
                            ? await Promise.all(
                                  category.items.map(async (item: MediaItem) => {
                                      item.thumbnail = await shrinkAndDownload({
                                          media: item.thumbnail,
                                          name: `${item.title}`,
                                          flag: "thumbnail",
                                      });
                                      item.clip = await shrinkAndDownload({
                                          media: item.clip,
                                          name: `${item.title}`,
                                      });
                                      return item;
                                  })
                              )
                            : [];
                        return category;
                    })
                );
            }
            if (content._type === "artifacts") {
                content.items = await Promise.all(
                    content.items.map(async (item: Item) => {
                        item.artifactImages = item.artifactImages
                            ? await Promise.all(
                                  item.artifactImages.map(async (image: ArtifactImage, i: number) => {
                                      image.image = await shrinkAndDownload({
                                          media: image.image,
                                          name: `${item.title}-${i + 1}`,
                                          flag: "artifact",
                                          height: image.height,
                                      });
                                      return image;
                                  })
                              )
                            : [];
                        if (item.artifactImages.length === 0) console.warn(`Artifact ${item.artifactNumber} has no images defined.`);
                        return item;
                    })
                );
            }
            return content;
        })
    );

    fs.writeFile(`${mediaDir}rail.json`, JSON.stringify(railResult), function (err) {
        if (err) throw err;
        console.log("Rail definition written to rail.json.");
    });

    res.send(railResult);
});
