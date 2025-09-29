import getClusterInstance from "../config/initCluster";

const getEmail = async (url: string) => {
  const cluster = await getClusterInstance();

  const result = await cluster.execute(url, async ({ page, data }) => {
    try {
      const start = performance.now();

      await page.goto(data, { waitUntil: "domcontentloaded",timeout:7000 });

      // Get full page HTML
      const html = await page.content();

      // Regex to extract emails
      const emailRegex =
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = html.match(emailRegex);

      const end = performance.now();
      console.log(`Time taken to get email : ${end - start} ms`);

      if (emails && emails.length > 0) {
        return emails[0]; // return first email found
      }

      return null;
    } catch (err) {
      console.error(err);
      return null;
    }
  });

  return result;
};



export {getEmail};