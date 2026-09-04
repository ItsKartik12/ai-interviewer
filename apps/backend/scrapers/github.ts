import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

export async function scrapeGithub(username: string) {
    const proxyUrl = process.env.PROXY_URL;
    const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

    const userRepos = await axios.request({
        url: `https://api.github.com/users/${username}/repos`,
        ...(httpsAgent ? { httpsAgent } : {}),
    });
    return userRepos.data.map((x: any) => ({
        description: x.description,
        name: x.name,
        fullName: x.full_name,
        starCount: x.stargazers_count
    }))

}