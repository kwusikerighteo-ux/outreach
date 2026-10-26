# Hub setup: the simple version

**What you will do:** copy some code into your Google Sheet, click a few buttons, and copy two links.
**Time:** about 15 minutes. Do one step at a time.

---

## Part 1: Copy the code
1. On your Desktop, open the folder **Outreach Dashboard**.
2. Open the folder **apps-script**.
3. Right-click the file **OutreachHub.gs**.
4. Click **Open with**, then click **Notepad**.
5. Press **Ctrl + A** (all the text turns blue).
6. Press **Ctrl + C** (this copies it).

## Part 2: Put the code in your sheet
1. Open your CRM Google Sheet in Chrome.
2. At the top, click **Extensions**.
3. Click **Apps Script**. A new tab opens with some code in it.
4. Click once inside the code.
5. Press **Ctrl + A**, then press **Delete**. The code area is now empty.
6. Press **Ctrl + V**. Your code appears.
7. Press **Ctrl + S** to save.

## Part 3: Turn it on
1. Click back on the tab with your **sheet**.
2. Press **F5** to reload the page.
3. Wait about 10 seconds. A new menu called **Outreach** appears at the top (next to **Help**).
4. Click **Outreach**, then click **1. Set up**.
5. A box says "Authorization required". Click **Continue**.
6. Click your Google account.
7. If you see "Google hasn't verified this app":
   click **Advanced** (small grey text), then click **Go to Outreach Hub (unsafe)**.
   *It's safe: it's your own code.*
8. Click **Allow**.
9. Click **Outreach**, then **1. Set up** again. A box says **"Step 1 done"**. Click **OK**.

## Part 4: Make LINK 1
1. Click back on the **Apps Script** tab.
2. Click the blue **Deploy** button (top right).
3. Click **New deployment**.
4. Click the small **gear ⚙** next to "Select type".
5. Click **Web app**.
6. Under **Execute as**, pick **Me**.
7. Under **Who has access**, pick **Anyone**.
8. Click **Deploy**. (If it asks, click **Authorize access** and allow it like in Part 3.)
9. You now see a long link under **Web app**. Click **Copy**.
10. Open Notepad, press **Ctrl + V**, and type **LINK 1** above it.
11. Click **Done**.

## Part 5: Make LINK 2
Do Part 4 again, but change two choices:
- Step 6, **Execute as**: pick **User accessing the web app**
- Step 7, **Who has access**: pick **Anyone with Google account**

Paste this one in Notepad as **LINK 2**.

## Part 6: Give the links to your sheet
1. Click back on your **sheet** tab.
2. Click **Outreach**, then **2. Save web app links**.
3. **Box 1** asks for your dashboard address.
   Paste the address you use to open your dashboard on GitHub, then click **OK**.
   It looks like: `https://your-name.github.io/your-repo/`
4. **Box 2**: paste **LINK 1**, then click **OK**.
5. **Box 3**: paste **LINK 2**, then click **OK**.
6. A window called **Your Outreach links** opens. Keep it open.

## Part 7: Connect your inboxes (repeat for each sending inbox)
1. In **Your Outreach links**, click **Copy** next to **Connect an inbox**.
2. Press **Ctrl + Shift + N**. A private Chrome window opens.
3. Go to **gmail.com** and sign in to the inbox you want to connect.
4. Click the address bar at the top, press **Ctrl + V**, then **Enter**.
5. Allow it, like in Part 3: **Continue** → the inbox → **Advanced** → **Go to Outreach Hub (unsafe)** → **Allow**.
6. Click the blue **Connect** button. It says **"Connected ✓"**.
7. Close the private window. Do the next inbox.

To see which inboxes are done: in your sheet click **Outreach** → **Connected inboxes**.

## Part 8: Open the app on your phone
1. In your sheet, click **Outreach** → **Show links**.
2. Click **Copy** next to **Phone app**, and send it to yourself (WhatsApp or email).
3. On your phone, open the link in **Chrome**.
4. Tap **App** at the bottom, then tap **Install**.

**Done!** Your dashboard and inbox now update by themselves.
