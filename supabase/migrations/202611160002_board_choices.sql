-- Board choices are immutable for a room. Faces are copied into each game for durable play.
-- All packs in this release are free. No purchases or client-provided entitlements are accepted.
create table private.board_catalog (
 id text primary key, kind text not null check(kind in ('illustrated','synthetic-photo')),
 shuffled boolean not null, enabled boolean not null default true
);
insert into private.board_catalog(id,kind,shuffled) values
 ('generated-v1','illustrated',true),('million-faces-v1','synthetic-photo',false),
 ('million-faces-shuffle-v1','synthetic-photo',true);
alter table public.rooms add column board_id text not null default 'generated-v1' references private.board_catalog(id);
alter table private.match_queue add column board_id text not null default 'generated-v1' references private.board_catalog(id);
create index queue_board_waiting on private.match_queue(board_id,queued_at,user_id) where room_id is null;
create table private.board_faces(position integer primary key, id text not null unique, definition jsonb not null);
-- Pinned source: RichardErkhov/OneMillionFaces @ 994602d29fe96cc11d3d4a50d436801ce73fdae3.
-- Full provenance, source hashes and initial visual-review notes: artwork/one-million-faces/manifest.json.
insert into private.board_faces(position,id,definition) values
 (0,'omf-seed0000','{"id":"omf-seed0000","name":"Alex","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0000.webp","alt":"Alex, a fictional AI-generated portrait"}'::jsonb),
 (1,'omf-seed0001','{"id":"omf-seed0001","name":"Blair","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0001.webp","alt":"Blair, a fictional AI-generated portrait"}'::jsonb),
 (2,'omf-seed0002','{"id":"omf-seed0002","name":"Casey","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0002.webp","alt":"Casey, a fictional AI-generated portrait"}'::jsonb),
 (3,'omf-seed0004','{"id":"omf-seed0004","name":"Devon","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0004.webp","alt":"Devon, a fictional AI-generated portrait"}'::jsonb),
 (4,'omf-seed0011','{"id":"omf-seed0011","name":"Emery","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0011.webp","alt":"Emery, a fictional AI-generated portrait"}'::jsonb),
 (5,'omf-seed0017','{"id":"omf-seed0017","name":"Frankie","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0017.webp","alt":"Frankie, a fictional AI-generated portrait"}'::jsonb),
 (6,'omf-seed0019','{"id":"omf-seed0019","name":"Gray","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0019.webp","alt":"Gray, a fictional AI-generated portrait"}'::jsonb),
 (7,'omf-seed0022','{"id":"omf-seed0022","name":"Harper","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0022.webp","alt":"Harper, a fictional AI-generated portrait"}'::jsonb),
 (8,'omf-seed0027','{"id":"omf-seed0027","name":"Indigo","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0027.webp","alt":"Indigo, a fictional AI-generated portrait"}'::jsonb),
 (9,'omf-seed0028','{"id":"omf-seed0028","name":"Jamie","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0028.webp","alt":"Jamie, a fictional AI-generated portrait"}'::jsonb),
 (10,'omf-seed0033','{"id":"omf-seed0033","name":"Kai","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0033.webp","alt":"Kai, a fictional AI-generated portrait"}'::jsonb),
 (11,'omf-seed0040','{"id":"omf-seed0040","name":"Lane","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0040.webp","alt":"Lane, a fictional AI-generated portrait"}'::jsonb),
 (12,'omf-seed0042','{"id":"omf-seed0042","name":"Morgan","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0042.webp","alt":"Morgan, a fictional AI-generated portrait"}'::jsonb),
 (13,'omf-seed0050','{"id":"omf-seed0050","name":"Nico","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0050.webp","alt":"Nico, a fictional AI-generated portrait"}'::jsonb),
 (14,'omf-seed0054','{"id":"omf-seed0054","name":"Oakley","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0054.webp","alt":"Oakley, a fictional AI-generated portrait"}'::jsonb),
 (15,'omf-seed0061','{"id":"omf-seed0061","name":"Parker","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0061.webp","alt":"Parker, a fictional AI-generated portrait"}'::jsonb),
 (16,'omf-seed0070','{"id":"omf-seed0070","name":"Quinn","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0070.webp","alt":"Quinn, a fictional AI-generated portrait"}'::jsonb),
 (17,'omf-seed0075','{"id":"omf-seed0075","name":"Reese","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0075.webp","alt":"Reese, a fictional AI-generated portrait"}'::jsonb),
 (18,'omf-seed0086','{"id":"omf-seed0086","name":"Sage","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0086.webp","alt":"Sage, a fictional AI-generated portrait"}'::jsonb),
 (19,'omf-seed0097','{"id":"omf-seed0097","name":"Taylor","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0097.webp","alt":"Taylor, a fictional AI-generated portrait"}'::jsonb),
 (20,'omf-seed0111','{"id":"omf-seed0111","name":"Val","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0111.webp","alt":"Val, a fictional AI-generated portrait"}'::jsonb),
 (21,'omf-seed0147','{"id":"omf-seed0147","name":"Wren","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0147.webp","alt":"Wren, a fictional AI-generated portrait"}'::jsonb),
 (22,'omf-seed0168','{"id":"omf-seed0168","name":"Yael","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0168.webp","alt":"Yael, a fictional AI-generated portrait"}'::jsonb),
 (23,'omf-seed0231','{"id":"omf-seed0231","name":"Zion","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0231.webp","alt":"Zion, a fictional AI-generated portrait"}'::jsonb),
 (24,'omf-seed0003','{"id":"omf-seed0003","name":"Ari","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0003.webp","alt":"Ari, a fictional AI-generated portrait"}'::jsonb),
 (25,'omf-seed0005','{"id":"omf-seed0005","name":"Bailey","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0005.webp","alt":"Bailey, a fictional AI-generated portrait"}'::jsonb),
 (26,'omf-seed0007','{"id":"omf-seed0007","name":"Cameron","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0007.webp","alt":"Cameron, a fictional AI-generated portrait"}'::jsonb),
 (27,'omf-seed0008','{"id":"omf-seed0008","name":"Dakota","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0008.webp","alt":"Dakota, a fictional AI-generated portrait"}'::jsonb),
 (28,'omf-seed0009','{"id":"omf-seed0009","name":"Ellis","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0009.webp","alt":"Ellis, a fictional AI-generated portrait"}'::jsonb),
 (29,'omf-seed0010','{"id":"omf-seed0010","name":"Finley","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0010.webp","alt":"Finley, a fictional AI-generated portrait"}'::jsonb),
 (30,'omf-seed0012','{"id":"omf-seed0012","name":"Georgie","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0012.webp","alt":"Georgie, a fictional AI-generated portrait"}'::jsonb),
 (31,'omf-seed0013','{"id":"omf-seed0013","name":"Hayden","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0013.webp","alt":"Hayden, a fictional AI-generated portrait"}'::jsonb),
 (32,'omf-seed0014','{"id":"omf-seed0014","name":"Ira","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0014.webp","alt":"Ira, a fictional AI-generated portrait"}'::jsonb),
 (33,'omf-seed0015','{"id":"omf-seed0015","name":"Jordan","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0015.webp","alt":"Jordan, a fictional AI-generated portrait"}'::jsonb),
 (34,'omf-seed0018','{"id":"omf-seed0018","name":"Kendall","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0018.webp","alt":"Kendall, a fictional AI-generated portrait"}'::jsonb),
 (35,'omf-seed0020','{"id":"omf-seed0020","name":"Lee","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0020.webp","alt":"Lee, a fictional AI-generated portrait"}'::jsonb),
 (36,'omf-seed0021','{"id":"omf-seed0021","name":"Marlow","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0021.webp","alt":"Marlow, a fictional AI-generated portrait"}'::jsonb),
 (37,'omf-seed0023','{"id":"omf-seed0023","name":"Noel","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0023.webp","alt":"Noel, a fictional AI-generated portrait"}'::jsonb),
 (38,'omf-seed0024','{"id":"omf-seed0024","name":"Ollie","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0024.webp","alt":"Ollie, a fictional AI-generated portrait"}'::jsonb),
 (39,'omf-seed0025','{"id":"omf-seed0025","name":"Perry","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0025.webp","alt":"Perry, a fictional AI-generated portrait"}'::jsonb),
 (40,'omf-seed0026','{"id":"omf-seed0026","name":"Remy","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0026.webp","alt":"Remy, a fictional AI-generated portrait"}'::jsonb),
 (41,'omf-seed0030','{"id":"omf-seed0030","name":"Sasha","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0030.webp","alt":"Sasha, a fictional AI-generated portrait"}'::jsonb),
 (42,'omf-seed0031','{"id":"omf-seed0031","name":"Toby","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0031.webp","alt":"Toby, a fictional AI-generated portrait"}'::jsonb),
 (43,'omf-seed0032','{"id":"omf-seed0032","name":"Winter","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0032.webp","alt":"Winter, a fictional AI-generated portrait"}'::jsonb),
 (44,'omf-seed0034','{"id":"omf-seed0034","name":"Avery","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0034.webp","alt":"Avery, a fictional AI-generated portrait"}'::jsonb),
 (45,'omf-seed0035','{"id":"omf-seed0035","name":"Beau","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0035.webp","alt":"Beau, a fictional AI-generated portrait"}'::jsonb),
 (46,'omf-seed0036','{"id":"omf-seed0036","name":"Charlie","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0036.webp","alt":"Charlie, a fictional AI-generated portrait"}'::jsonb),
 (47,'omf-seed0039','{"id":"omf-seed0039","name":"Drew","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0039.webp","alt":"Drew, a fictional AI-generated portrait"}'::jsonb),
 (48,'omf-seed0041','{"id":"omf-seed0041","name":"Eden","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0041.webp","alt":"Eden, a fictional AI-generated portrait"}'::jsonb),
 (49,'omf-seed0045','{"id":"omf-seed0045","name":"Flynn","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0045.webp","alt":"Flynn, a fictional AI-generated portrait"}'::jsonb),
 (50,'omf-seed0046','{"id":"omf-seed0046","name":"Gale","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0046.webp","alt":"Gale, a fictional AI-generated portrait"}'::jsonb),
 (51,'omf-seed0047','{"id":"omf-seed0047","name":"Hollis","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0047.webp","alt":"Hollis, a fictional AI-generated portrait"}'::jsonb),
 (52,'omf-seed0048','{"id":"omf-seed0048","name":"Jesse","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0048.webp","alt":"Jesse, a fictional AI-generated portrait"}'::jsonb),
 (53,'omf-seed0049','{"id":"omf-seed0049","name":"Kit","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0049.webp","alt":"Kit, a fictional AI-generated portrait"}'::jsonb),
 (54,'omf-seed0051','{"id":"omf-seed0051","name":"Logan","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0051.webp","alt":"Logan, a fictional AI-generated portrait"}'::jsonb),
 (55,'omf-seed0052','{"id":"omf-seed0052","name":"Marley","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0052.webp","alt":"Marley, a fictional AI-generated portrait"}'::jsonb),
 (56,'omf-seed0053','{"id":"omf-seed0053","name":"Nova","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0053.webp","alt":"Nova, a fictional AI-generated portrait"}'::jsonb),
 (57,'omf-seed0055','{"id":"omf-seed0055","name":"Ocean","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0055.webp","alt":"Ocean, a fictional AI-generated portrait"}'::jsonb),
 (58,'omf-seed0057','{"id":"omf-seed0057","name":"Payton","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0057.webp","alt":"Payton, a fictional AI-generated portrait"}'::jsonb),
 (59,'omf-seed0060','{"id":"omf-seed0060","name":"Riley","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0060.webp","alt":"Riley, a fictional AI-generated portrait"}'::jsonb),
 (60,'omf-seed0062','{"id":"omf-seed0062","name":"Sam","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0062.webp","alt":"Sam, a fictional AI-generated portrait"}'::jsonb),
 (61,'omf-seed0063','{"id":"omf-seed0063","name":"Tatum","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0063.webp","alt":"Tatum, a fictional AI-generated portrait"}'::jsonb),
 (62,'omf-seed0064','{"id":"omf-seed0064","name":"Whitney","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0064.webp","alt":"Whitney, a fictional AI-generated portrait"}'::jsonb),
 (63,'omf-seed0065','{"id":"omf-seed0065","name":"Adair","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0065.webp","alt":"Adair, a fictional AI-generated portrait"}'::jsonb),
 (64,'omf-seed0066','{"id":"omf-seed0066","name":"Bellamy","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0066.webp","alt":"Bellamy, a fictional AI-generated portrait"}'::jsonb),
 (65,'omf-seed0067','{"id":"omf-seed0067","name":"Cory","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0067.webp","alt":"Cory, a fictional AI-generated portrait"}'::jsonb),
 (66,'omf-seed0068','{"id":"omf-seed0068","name":"Dallas","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0068.webp","alt":"Dallas, a fictional AI-generated portrait"}'::jsonb),
 (67,'omf-seed0069','{"id":"omf-seed0069","name":"Evan","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0069.webp","alt":"Evan, a fictional AI-generated portrait"}'::jsonb),
 (68,'omf-seed0071','{"id":"omf-seed0071","name":"Francis","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0071.webp","alt":"Francis, a fictional AI-generated portrait"}'::jsonb),
 (69,'omf-seed0073','{"id":"omf-seed0073","name":"Glenn","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0073.webp","alt":"Glenn, a fictional AI-generated portrait"}'::jsonb),
 (70,'omf-seed0074','{"id":"omf-seed0074","name":"Haven","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0074.webp","alt":"Haven, a fictional AI-generated portrait"}'::jsonb),
 (71,'omf-seed0076','{"id":"omf-seed0076","name":"Jody","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0076.webp","alt":"Jody, a fictional AI-generated portrait"}'::jsonb),
 (72,'omf-seed0079','{"id":"omf-seed0079","name":"Kelly","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0079.webp","alt":"Kelly, a fictional AI-generated portrait"}'::jsonb),
 (73,'omf-seed0082','{"id":"omf-seed0082","name":"Lennox","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0082.webp","alt":"Lennox, a fictional AI-generated portrait"}'::jsonb),
 (74,'omf-seed0083','{"id":"omf-seed0083","name":"Micah","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0083.webp","alt":"Micah, a fictional AI-generated portrait"}'::jsonb),
 (75,'omf-seed0084','{"id":"omf-seed0084","name":"North","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0084.webp","alt":"North, a fictional AI-generated portrait"}'::jsonb),
 (76,'omf-seed0085','{"id":"omf-seed0085","name":"Orin","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0085.webp","alt":"Orin, a fictional AI-generated portrait"}'::jsonb),
 (77,'omf-seed0088','{"id":"omf-seed0088","name":"Phoenix","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0088.webp","alt":"Phoenix, a fictional AI-generated portrait"}'::jsonb),
 (78,'omf-seed0089','{"id":"omf-seed0089","name":"River","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0089.webp","alt":"River, a fictional AI-generated portrait"}'::jsonb),
 (79,'omf-seed0090','{"id":"omf-seed0090","name":"Sawyer","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0090.webp","alt":"Sawyer, a fictional AI-generated portrait"}'::jsonb),
 (80,'omf-seed0091','{"id":"omf-seed0091","name":"Teagan","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0091.webp","alt":"Teagan, a fictional AI-generated portrait"}'::jsonb),
 (81,'omf-seed0093','{"id":"omf-seed0093","name":"Wynn","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0093.webp","alt":"Wynn, a fictional AI-generated portrait"}'::jsonb),
 (82,'omf-seed0094','{"id":"omf-seed0094","name":"Adrian","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0094.webp","alt":"Adrian, a fictional AI-generated portrait"}'::jsonb),
 (83,'omf-seed0096','{"id":"omf-seed0096","name":"Amari","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0096.webp","alt":"Amari, a fictional AI-generated portrait"}'::jsonb),
 (84,'omf-seed0098','{"id":"omf-seed0098","name":"Aspen","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0098.webp","alt":"Aspen, a fictional AI-generated portrait"}'::jsonb),
 (85,'omf-seed0100','{"id":"omf-seed0100","name":"Blake","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0100.webp","alt":"Blake, a fictional AI-generated portrait"}'::jsonb),
 (86,'omf-seed0101','{"id":"omf-seed0101","name":"Cody","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0101.webp","alt":"Cody, a fictional AI-generated portrait"}'::jsonb),
 (87,'omf-seed0103','{"id":"omf-seed0103","name":"Darcy","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0103.webp","alt":"Darcy, a fictional AI-generated portrait"}'::jsonb),
 (88,'omf-seed0104','{"id":"omf-seed0104","name":"Elliot","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0104.webp","alt":"Elliot, a fictional AI-generated portrait"}'::jsonb),
 (89,'omf-seed0107','{"id":"omf-seed0107","name":"Fern","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0107.webp","alt":"Fern, a fictional AI-generated portrait"}'::jsonb),
 (90,'omf-seed0109','{"id":"omf-seed0109","name":"Greer","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0109.webp","alt":"Greer, a fictional AI-generated portrait"}'::jsonb),
 (91,'omf-seed0112','{"id":"omf-seed0112","name":"Hunter","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0112.webp","alt":"Hunter, a fictional AI-generated portrait"}'::jsonb),
 (92,'omf-seed0115','{"id":"omf-seed0115","name":"Jules","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0115.webp","alt":"Jules, a fictional AI-generated portrait"}'::jsonb),
 (93,'omf-seed0116','{"id":"omf-seed0116","name":"Kelsey","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0116.webp","alt":"Kelsey, a fictional AI-generated portrait"}'::jsonb),
 (94,'omf-seed0117','{"id":"omf-seed0117","name":"Linden","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0117.webp","alt":"Linden, a fictional AI-generated portrait"}'::jsonb),
 (95,'omf-seed0118','{"id":"omf-seed0118","name":"Milan","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0118.webp","alt":"Milan, a fictional AI-generated portrait"}'::jsonb),
 (96,'omf-seed0120','{"id":"omf-seed0120","name":"Nicky","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0120.webp","alt":"Nicky, a fictional AI-generated portrait"}'::jsonb),
 (97,'omf-seed0121','{"id":"omf-seed0121","name":"Onyx","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0121.webp","alt":"Onyx, a fictional AI-generated portrait"}'::jsonb),
 (98,'omf-seed0122','{"id":"omf-seed0122","name":"Page","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0122.webp","alt":"Page, a fictional AI-generated portrait"}'::jsonb),
 (99,'omf-seed0124','{"id":"omf-seed0124","name":"Robin","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0124.webp","alt":"Robin, a fictional AI-generated portrait"}'::jsonb),
 (100,'omf-seed0125','{"id":"omf-seed0125","name":"Shiloh","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0125.webp","alt":"Shiloh, a fictional AI-generated portrait"}'::jsonb),
 (101,'omf-seed0126','{"id":"omf-seed0126","name":"Terry","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0126.webp","alt":"Terry, a fictional AI-generated portrait"}'::jsonb),
 (102,'omf-seed0130','{"id":"omf-seed0130","name":"West","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0130.webp","alt":"West, a fictional AI-generated portrait"}'::jsonb),
 (103,'omf-seed0132','{"id":"omf-seed0132","name":"Ash","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0132.webp","alt":"Ash, a fictional AI-generated portrait"}'::jsonb),
 (104,'omf-seed0135','{"id":"omf-seed0135","name":"Billie","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0135.webp","alt":"Billie, a fictional AI-generated portrait"}'::jsonb),
 (105,'omf-seed0136','{"id":"omf-seed0136","name":"Cary","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0136.webp","alt":"Cary, a fictional AI-generated portrait"}'::jsonb),
 (106,'omf-seed0137','{"id":"omf-seed0137","name":"Dell","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0137.webp","alt":"Dell, a fictional AI-generated portrait"}'::jsonb),
 (107,'omf-seed0138','{"id":"omf-seed0138","name":"Elia","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0138.webp","alt":"Elia, a fictional AI-generated portrait"}'::jsonb),
 (108,'omf-seed0139','{"id":"omf-seed0139","name":"Fallon","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0139.webp","alt":"Fallon, a fictional AI-generated portrait"}'::jsonb),
 (109,'omf-seed0140','{"id":"omf-seed0140","name":"Gene","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0140.webp","alt":"Gene, a fictional AI-generated portrait"}'::jsonb),
 (110,'omf-seed0141','{"id":"omf-seed0141","name":"Halley","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0141.webp","alt":"Halley, a fictional AI-generated portrait"}'::jsonb),
 (111,'omf-seed0142','{"id":"omf-seed0142","name":"Jay","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0142.webp","alt":"Jay, a fictional AI-generated portrait"}'::jsonb),
 (112,'omf-seed0143','{"id":"omf-seed0143","name":"Kerry","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0143.webp","alt":"Kerry, a fictional AI-generated portrait"}'::jsonb),
 (113,'omf-seed0144','{"id":"omf-seed0144","name":"London","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0144.webp","alt":"London, a fictional AI-generated portrait"}'::jsonb),
 (114,'omf-seed0146','{"id":"omf-seed0146","name":"Merritt","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0146.webp","alt":"Merritt, a fictional AI-generated portrait"}'::jsonb),
 (115,'omf-seed0149','{"id":"omf-seed0149","name":"Nile","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0149.webp","alt":"Nile, a fictional AI-generated portrait"}'::jsonb),
 (116,'omf-seed0150','{"id":"omf-seed0150","name":"Palmer","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0150.webp","alt":"Palmer, a fictional AI-generated portrait"}'::jsonb),
 (117,'omf-seed0151','{"id":"omf-seed0151","name":"Rory","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0151.webp","alt":"Rory, a fictional AI-generated portrait"}'::jsonb),
 (118,'omf-seed0152','{"id":"omf-seed0152","name":"Scout","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0152.webp","alt":"Scout, a fictional AI-generated portrait"}'::jsonb),
 (119,'omf-seed0154','{"id":"omf-seed0154","name":"Toni","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0154.webp","alt":"Toni, a fictional AI-generated portrait"}'::jsonb),
 (120,'omf-seed0155','{"id":"omf-seed0155","name":"Wesley","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0155.webp","alt":"Wesley, a fictional AI-generated portrait"}'::jsonb),
 (121,'omf-seed0156','{"id":"omf-seed0156","name":"Alix","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0156.webp","alt":"Alix, a fictional AI-generated portrait"}'::jsonb),
 (122,'omf-seed0157','{"id":"omf-seed0157","name":"Auden","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0157.webp","alt":"Auden, a fictional AI-generated portrait"}'::jsonb),
 (123,'omf-seed0158','{"id":"omf-seed0158","name":"Briar","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0158.webp","alt":"Briar, a fictional AI-generated portrait"}'::jsonb),
 (124,'omf-seed0159','{"id":"omf-seed0159","name":"Chris","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0159.webp","alt":"Chris, a fictional AI-generated portrait"}'::jsonb),
 (125,'omf-seed0160','{"id":"omf-seed0160","name":"Dylan","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0160.webp","alt":"Dylan, a fictional AI-generated portrait"}'::jsonb),
 (126,'omf-seed0164','{"id":"omf-seed0164","name":"Emerson","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0164.webp","alt":"Emerson, a fictional AI-generated portrait"}'::jsonb),
 (127,'omf-seed0165','{"id":"omf-seed0165","name":"Hadley","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0165.webp","alt":"Hadley, a fictional AI-generated portrait"}'::jsonb),
 (128,'omf-seed0166','{"id":"omf-seed0166","name":"Jackie","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0166.webp","alt":"Jackie, a fictional AI-generated portrait"}'::jsonb),
 (129,'omf-seed0167','{"id":"omf-seed0167","name":"Keegan","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0167.webp","alt":"Keegan, a fictional AI-generated portrait"}'::jsonb),
 (130,'omf-seed0171','{"id":"omf-seed0171","name":"Loren","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0171.webp","alt":"Loren, a fictional AI-generated portrait"}'::jsonb),
 (131,'omf-seed0172','{"id":"omf-seed0172","name":"Murphy","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0172.webp","alt":"Murphy, a fictional AI-generated portrait"}'::jsonb),
 (132,'omf-seed0174','{"id":"omf-seed0174","name":"Nat","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0174.webp","alt":"Nat, a fictional AI-generated portrait"}'::jsonb),
 (133,'omf-seed0175','{"id":"omf-seed0175","name":"Peyton","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0175.webp","alt":"Peyton, a fictional AI-generated portrait"}'::jsonb),
 (134,'omf-seed0179','{"id":"omf-seed0179","name":"Rowan","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0179.webp","alt":"Rowan, a fictional AI-generated portrait"}'::jsonb),
 (135,'omf-seed0183','{"id":"omf-seed0183","name":"Shannon","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0183.webp","alt":"Shannon, a fictional AI-generated portrait"}'::jsonb),
 (136,'omf-seed0186','{"id":"omf-seed0186","name":"True","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0186.webp","alt":"True, a fictional AI-generated portrait"}'::jsonb),
 (137,'omf-seed0187','{"id":"omf-seed0187","name":"Vale","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0187.webp","alt":"Vale, a fictional AI-generated portrait"}'::jsonb),
 (138,'omf-seed0191','{"id":"omf-seed0191","name":"Ali","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0191.webp","alt":"Ali, a fictional AI-generated portrait"}'::jsonb),
 (139,'omf-seed0194','{"id":"omf-seed0194","name":"Arden","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0194.webp","alt":"Arden, a fictional AI-generated portrait"}'::jsonb),
 (140,'omf-seed0195','{"id":"omf-seed0195","name":"Brett","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0195.webp","alt":"Brett, a fictional AI-generated portrait"}'::jsonb),
 (141,'omf-seed0196','{"id":"omf-seed0196","name":"Claude","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0196.webp","alt":"Claude, a fictional AI-generated portrait"}'::jsonb),
 (142,'omf-seed0198','{"id":"omf-seed0198","name":"Dana","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0198.webp","alt":"Dana, a fictional AI-generated portrait"}'::jsonb),
 (143,'omf-seed0200','{"id":"omf-seed0200","name":"Erin","color":"#eee7df","image":"/boards/one-million-faces-v1/seed0200.webp","alt":"Erin, a fictional AI-generated portrait"}'::jsonb);

alter function private.generate_cast(uuid,bigint) rename to generate_illustrated_cast;
create function private.generate_cast(p_game uuid,p_seed bigint) returns void
language plpgsql security definer set search_path='' as $$
declare selected text;
begin
 select r.board_id into selected from public.rooms r join public.games g on g.room_id=r.id where g.id=p_game;
 if selected='generated-v1' then
  perform private.generate_illustrated_cast(p_game,p_seed);
 else
  insert into public.game_characters(game_id,id,position,definition)
  select p_game,id,(row_number() over(order by score,position)-1)::integer,definition from (
   select f.*,case when selected='million-faces-shuffle-v1' then private.cast_pick(p_seed,f.position,41,2147483647) else f.position end as score
   from private.board_faces f order by score,f.position limit 24
  ) chosen;
 end if;
end; $$;
alter function private.snapshot_v2(uuid) rename to snapshot_without_board_v2;
create function private.snapshot_v2(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s jsonb; selected text;
begin
 s:=private.snapshot_without_board_v2(p_room);
 if s->>'rulesVersion'='2' then
  select board_id into selected from public.rooms where id=p_room;
  s:=s || jsonb_build_object('boardId',selected,'game',(s->'game')||jsonb_build_object('packId',selected));
 end if;
 return s;
end; $$;
create function private.new_board_room(p_user uuid,p_name text,p_settings jsonb,p_match boolean,p_board_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r uuid; g uuid; n integer;
begin
 if p_name is null or char_length(btrim(p_name)) not between 1 and 18 or p_name~'[[:cntrl:]]' then raise exception 'Use a nickname of 1–18 characters.'; end if;
 for n in 1..10 loop
  insert into public.rooms(code,matchmade,board_id) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,7)),p_match,p_board_id)
   on conflict(code) do nothing returning id into r;
  exit when r is not null;
 end loop;
 if r is null then raise exception 'Could not create a room. Try again.'; end if;
 insert into public.room_players(room_id,user_id,slot,nickname) values(r,p_user,1,btrim(p_name));
 insert into public.games(room_id,rules_version,settings) values(r,2,p_settings) returning id into g;
 perform private.generate_cast(g,floor(random()*2147483646)::bigint);
 update public.rooms set current_game_id=g where id=r;
 return r;
end; $$;
create or replace function private.new_v2(p_user uuid,p_name text,p_settings jsonb,p_match boolean default false) returns uuid
language sql security definer set search_path='' as $$
 select private.new_board_room(p_user,p_name,p_settings,p_match,'generated-v1');
$$;
create function public.create_room_board_v2(p_nickname text,p_request_id uuid,p_settings jsonb,p_board_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r uuid; old jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('error','Please reconnect to play.'); end if;
 if p_request_id is null or not coalesce(private.valid_settings(p_settings),false) then return jsonb_build_object('error','Choose valid activity timers. Review cannot exceed writing time.'); end if;
 if not coalesce((select enabled from private.board_catalog where id=p_board_id),false) then return jsonb_build_object('error','Choose an available board.'); end if;
 if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 18 or p_nickname~'[[:cntrl:]]' then return jsonb_build_object('error','Use a nickname of 1–18 characters.'); end if;
 perform pg_advisory_xact_lock(9827341);
 select room_id,request into r,old from private.action_receipts where user_id=auth.uid() and action_id=p_request_id;
 if found then
  if not public.is_room_member(r) then return jsonb_build_object('error','This room has expired. Create a fresh room.'); end if;
  if (old - 'boardId')<>jsonb_build_object('kind','create2','settings',p_settings,'nickname',p_nickname) or coalesce(old->>'boardId','generated-v1')<>p_board_id then return jsonb_build_object('error','This request ID was already used.'); end if;
  return jsonb_build_object('state',private.snapshot_v2(r));
 end if;
 if private.active_v2(auth.uid()) is not null then return jsonb_build_object('error','Finish or leave your current game first.'); end if;
 if not private.allow_request('create',5,3600) then return jsonb_build_object('error','Too many new rooms. Try again later.'); end if;
 if exists(select 1 from private.match_queue where user_id=auth.uid() and expires_at>clock_timestamp() and room_id is null) then return jsonb_build_object('error','Cancel your player search before creating a room.'); end if;
 r:=private.new_board_room(auth.uid(),p_nickname,p_settings,false,p_board_id);
 delete from private.match_queue where user_id=auth.uid();
 insert into private.action_receipts values(r,auth.uid(),p_request_id,jsonb_build_object('kind','create2','settings',p_settings,'nickname',p_nickname,'boardId',p_board_id));
 return jsonb_build_object('state',private.snapshot_v2(r));
end; $$;
create or replace function public.create_room_v2(p_nickname text,p_request_id uuid,p_settings jsonb default '{"question":120,"answer":30,"review":60}') returns jsonb
language sql security definer set search_path='' as $$
 select public.create_room_board_v2(p_nickname,p_request_id,p_settings,'generated-v1');
$$;
create function public.matchmake_board_v2(p_nickname text,p_command text,p_board_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me private.match_queue%rowtype; candidate private.match_queue%rowtype; r uuid; g public.games%rowtype; survivor uuid;
begin
 if auth.uid() is null then return jsonb_build_object('error','Please reconnect to find a player.'); end if;
 if p_command is null or p_command not in ('join','pulse','cancel') then return jsonb_build_object('error','Invalid search action.'); end if;
 if not private.allow_request('match',30,60) then return jsonb_build_object('error','Please wait a moment before searching again.'); end if;
 -- Only admission/pairing transactions share this lock; game actions and heartbeats
 -- do not. The indexed queue makes admission short and strictly FIFO.
 perform pg_advisory_xact_lock(9827341);
 select * into me from private.match_queue where user_id=auth.uid();
 if p_command='cancel' then
  if me.room_id is null then delete from private.match_queue where user_id=auth.uid(); return jsonb_build_object('status','idle'); end if;
 end if;
 if me.room_id is not null then
  perform 1 from public.rooms where id=me.room_id for update;
  update public.room_players set last_seen=clock_timestamp() where room_id=me.room_id and user_id=auth.uid();
  select * into g from public.games where id=(select current_game_id from public.rooms where id=me.room_id);
  if g.phase='lobby' and g.created_at<clock_timestamp()-interval '120 seconds' and (select count(*) from public.room_players where room_id=me.room_id and ready)<2 then
   select user_id into survivor from public.room_players where room_id=me.room_id and ready and last_seen>clock_timestamp()-interval '45 seconds';
   update public.games set phase='finished',end_reason='no_show',deadline=null where id=g.id;
   update private.match_queue set room_id=null,expires_at=clock_timestamp()+interval '30 seconds' where room_id=me.room_id and user_id=survivor;
   delete from private.match_queue where room_id=me.room_id;
   perform private.notify_room(me.room_id);
   if survivor is not null then perform private.match_notice(survivor); end if;
   select * into me from private.match_queue where user_id=auth.uid();
  elsif g.phase<>'finished' then
   return jsonb_build_object('status','matched','roomId',me.room_id,'boardId',(select board_id from public.rooms where id=me.room_id));
  else delete from private.match_queue where user_id=auth.uid(); me.user_id:=null; end if;
 end if;
 if p_command='cancel' then delete from private.match_queue where user_id=auth.uid(); return jsonb_build_object('status','idle'); end if;
 if p_command='join' and not coalesce((select enabled from private.board_catalog where id=p_board_id),false) then return jsonb_build_object('error','Choose an available board.'); end if;
 if private.active_v2(auth.uid()) is not null then return jsonb_build_object('error','Finish or leave your current game first.'); end if;
 if p_command='pulse' and (me.user_id is null or me.expires_at<clock_timestamp()) then
  delete from private.match_queue where user_id=auth.uid(); return jsonb_build_object('status','idle');
 end if;
 if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 18 or p_nickname~'[[:cntrl:]]' then return jsonb_build_object('error','Use a nickname of 1–18 characters.'); end if;
 if me.user_id is not null and me.expires_at<clock_timestamp() then delete from private.match_queue where user_id=auth.uid(); end if;
 -- Changing boards starts a new FIFO position; pulses keep the saved preference.
 if p_command='join' and me.board_id<>p_board_id then delete from private.match_queue where user_id=auth.uid(); end if;
 insert into private.match_queue(user_id,nickname,board_id) values(auth.uid(),btrim(p_nickname),case when p_command='pulse' then me.board_id else p_board_id end) on conflict(user_id) do update set expires_at=clock_timestamp()+interval '30 seconds';
 select * into me from private.match_queue where user_id=auth.uid();
 if not coalesce((select enabled from private.board_catalog where id=me.board_id),false) then
  delete from private.match_queue where user_id=auth.uid();
  return jsonb_build_object('error','This board is currently unavailable. Choose another board.');
 end if;
 select * into candidate from private.match_queue q where q.user_id<>auth.uid() and q.board_id=me.board_id and q.room_id is null and q.expires_at>clock_timestamp()
  and private.active_v2(q.user_id) is null order by q.queued_at,q.user_id limit 1 for update;
 if found then
  r:=private.new_board_room(candidate.user_id,candidate.nickname,'{"question":120,"answer":30,"review":60}',true,me.board_id);
  insert into public.room_players(room_id,user_id,slot,nickname) values(r,auth.uid(),2,btrim(p_nickname));
  update private.match_queue set room_id=r where user_id in (auth.uid(),candidate.user_id);
  perform private.match_notice(candidate.user_id); perform private.match_notice(auth.uid());
  return jsonb_build_object('status','matched','roomId',r,'boardId',me.board_id);
 end if;
 return jsonb_build_object('status','waiting','queuedAt',me.queued_at,'boardId',me.board_id);
end; $$;
create or replace function public.matchmake_v2(p_nickname text,p_command text) returns jsonb
language sql security definer set search_path='' as $$
 select public.matchmake_board_v2(p_nickname,p_command,'generated-v1');
$$;
revoke all on private.board_catalog,private.board_faces from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
revoke execute on function public.create_room_board_v2(text,uuid,jsonb,text),public.matchmake_board_v2(text,text,text) from public,anon,authenticated;
grant execute on function public.create_room_board_v2(text,uuid,jsonb,text),public.matchmake_board_v2(text,text,text) to authenticated;
