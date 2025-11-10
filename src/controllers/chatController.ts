import { type Request, type Response } from "express";
import { getChatsByAdminId, getLeads, createNewChat, getMessages, setAgentHandover,getFlows } from "../models/chats";
import mongoose from "mongoose";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const parsePageParams = (req: Request) => {
  const rawPage = req.body.page ?? req.query.page;
  const rawPageSize = req.body.pageSize ?? req.query.pageSize;
  const rawFilter = req.body.filter ?? req.query.filter;
  const rawSearch = req.body.search ?? req.query.search;

  const page = Math.max(1, Number(rawPage) || DEFAULT_PAGE);
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(rawPageSize) || DEFAULT_PAGE_SIZE));
  const filter = typeof rawFilter === "string" && rawFilter.trim() ? String(rawFilter).trim() : undefined;
  const search = typeof rawSearch === "string" && rawSearch.trim() ? String(rawSearch).trim() : undefined;

  return { page, pageSize, filter, search };
};

const getChats = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ status: false, message: "Missing userId" });

    const { page, pageSize, filter, search } = parsePageParams(req);

    const result = await getChatsByAdminId(userId, page, pageSize, filter, search);

    // normalize response
    const chats = result?.chats ?? [];
    const total = result?.total ?? chats.length;

    // console.log("Fetched chats:", chats);
    // attach lead details only for non-web chats
    const ids = [...new Set(chats.filter(c => c.channel !== "web" && c.userId).map(c => String(c.userId)))];

    // collect flowIds for all chats
    const flowIds = [...new Set(chats.filter(c => c.flowId).map(c => String(c.flowId)))];

    let leadMap = new Map();
    let flowMap = new Map();

    if (ids.length) {
      const fetchedLeads = await getLeads({ ids });
      leadMap = new Map(fetchedLeads.map((l: { id: any; }) => [String(l.id), l]));
    }

    if (flowIds.length) {
      const fetchedFlows = await getFlows({ ids: flowIds }); // SQL call for subflows
      flowMap = new Map<string, { name: string; configData: any }>(
        fetchedFlows.map((f: { id: any; campaignName: string; configData: any }) => [String(f.id), { campaignName: f.campaignName, configData: f.configData }])
      );
    }

    // mutate chats
    for (const c of chats) {
      const u = c.userId && leadMap.get(String(c.userId));
      if (u){ c.userDetails = { ...u };}

      const f = c.flowId && flowMap.get(String(c.flowId));
      if (f) {c.flowDetails = {... f};}
    }
    
    return res.json({
      data: chats,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (err) {
    console.error("getChats error:", err);
    return res.status(500).json({ status: false, message: "Unable to fetch chats right now." });
  }
};


const createChat = async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId, userId, flowId } = req.body;

    const isNewChat = await createNewChat(companyId, userId, flowId);

    if (!isNewChat) {
      return res
        .status(400)
        .send({ status: false, message: "Could not create a new chat right now" });
    }

    return res
      .status(200)
      .send({ status: true, message: "New chat created successfully" });
  } catch (err) {
    console.error("An error occured while creating new chat :", err);
    return res
      .status(500)
      .send({ status: false, message: "Unable to create new chat right now." });
  }
};

// get lastest 20 messages for a chat
const getMessagesByChat = async (req: Request, res: Response): Promise<any> => {
  try {
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({ status: false, message: "Missing chatId" });
    }

    const messages = await getMessages(chatId);

    return res.status(200).send({ status: true, data: messages });
  } catch (err) {
    console.error("An error occured while getting messages for a chat : ", err);
    return res
      .status(500)
      .send({ status: false, message: "Unable to get messages for this chat." });
  }
};

// handover to agent
const agentHandover = async (req: Request, res: Response): Promise<any> => {
  try {
    const { chatId, companyId, isHandover } = req.body;

    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    const isAgentHandover = await setAgentHandover(chatId, isHandover, companyId);

    if (!isAgentHandover) {
      return res
        .status(500)
        .send({ status: false, message: "Could not transfer this chat to you. Try again" });
    }

    return res.status(200).send({ status: true, message: "Chat transferred to you" });
  } catch (err) {
    console.error(`An error occured while handing over to agent : `, err);
    return res
      .status(500)
      .send({ status: false, message: "Unable to transfer this chat to you." });
  }
};

export { getChats, createChat, getMessagesByChat, agentHandover };
