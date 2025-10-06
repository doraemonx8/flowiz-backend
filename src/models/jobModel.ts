import { Job } from "./schema";

const addJob=async(id:string,companyId:string,userId:string,flowId:string,campaignId:string,leadId:string,channel:string)=>{

    try{

        const job=await Job.create({
            _id:id,
            companyId,
            userId,
            leadId,
            flowId,
            campaignId,
            channel,
            status:"pending",
        })

        return true;
    }catch(err){
        console.error(err);
        return false;
    }
}

const updateJobStatus=async(id:string,status:string,reason?:string)=>{

    try{

        await Job.findByIdAndUpdate(id,{
            status,
            reason
        });

        return true;
    }catch(err){
        console.error(err);
        return false;
    }
}


const getJobIdsToRemove=async(companyId:string,adminId:string,flowId:string,leadId:string)=>{

    try{

        const jobs=await Job.find({companyId,userId:adminId,leadId,flowId,status:"pending"});


        //updating
        await Job.updateMany(
            {_id:{$in:jobs}},
            {$set:{status:"removed"}}
        );
        return jobs.map((job)=> job._id);
    }catch(err){
        console.error(err);
        return [];
    }
}


const removeAllJobsFromCampaign=async(campaignId:string)=>{

    try{
        
        //updating
        await Job.updateMany(
            {campaignId,status:"pending"},
            {$set:{status:"cancelled"}}
        );

        const jobs = await Job.find(
        { campaignId, status: "pending" },
        {_id: 1 }
        ).lean();

        if (!jobs.length) {
        console.log(`No pending jobs found for campaign ${campaignId}`);
        return [];
        }

        const jobIds = jobs.map(j => String(j._id));

        await Job.updateMany(
        { campaignId, status: "pending" },
        { $set: { status: "cancelled" } }
        );

        return jobIds;
    }catch(err){
        console.error(err);
        return [];
    }
}

export {addJob,updateJobStatus,getJobIdsToRemove,removeAllJobsFromCampaign};