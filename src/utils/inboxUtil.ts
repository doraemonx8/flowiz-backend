const getCurrentDate=()=>{

    const curr = new Date();
    const numberToMonth=["Jan","Feb","Mar","Apr","May","Jun","July","Aug","Sep","Oct","Nov","Dec"];
    const date=`${curr.getDate()}-${numberToMonth[curr.getMonth()]}-${curr.getFullYear()}`;

    return date;
}

export {getCurrentDate};