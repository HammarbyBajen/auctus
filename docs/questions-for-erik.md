# Questions for Erik

Context: we are planning a lead and retention CRM for CrossFit Tegen, replacing Pipedrive and built on top of Mana. These answers are needed before the PRD is final.

## Mana

1. Does Mana offer webhooks or exports that are not in the public docs? Without them we poll, within the known limit of about one request per second per gym. A: There is no known limit but we only know about the one request each second. We can try to see if there is a daily request limit. And as it is in Alpha we should continuously check the Mana Documentation daily for updates. 
2. Mana is in alpha. Is there a contact at Mana we can ask about API changes, and is there a test studio or sandbox? A: No. 

## Hosting

3. Which of the Lab37 office servers can host the database and background sync (specs, OS, free capacity)?
4. We plan to use Vercel for the web app and the local server for the rest. Can the local server be reached from Vercel (public IP, port forwarding, VPN), or should the whole app run on the local server? A: Everything on Vercel. Maybe use 
5. Backups: is there an off-site or second location for nightly database backups? A: no backups needed now. 
6. Which domain should the CRM live on (for example `crm.crossfittegen.se` or a Lab37 domain)? A: We use Vercel. 

## Salary (WFM) module

7. Has any class been cancelled in Mana since September? How does a cancelled class show in the schedule (removed, or marked)? A: if the class is cancelled it is removed. 
8. Tegenbutik, Tegenmöte, NSI and PT classes exist in Mana but have no scheduled events in September to November. How are shop and meeting hours recorded today, and does Fredrik plan to schedule them in Mana? Ask Fredrik also which PT and Onramp booking statuses count as hours worked (completed only?).
Max will Check Fredrik or Timmy if coaches ever has Tegenmöte and what the deals. 

## Anything missed

9. Is there anything we have missed? Things Fredrik and Timmy complain about in Pipedrive, weekly reports they need, or leads that fall through the cracks today.



