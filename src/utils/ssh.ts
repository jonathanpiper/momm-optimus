import { NodeSSH } from "node-ssh"
import os from 'os'

export const homedir = os.homedir();
export const ssh = new NodeSSH()