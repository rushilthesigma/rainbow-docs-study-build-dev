// PAUSD-style elective: "Africa Geography", generated from the user's IGC Africa
// study notes (see /Users/.../IGC Africa Document). One unit per country or
// territory, in the notes' order. Each unit has a Cities lesson and a Physical
// Geography & Regions lesson (plus a Peoples & Ethnic Groups lesson where the
// notes break ethnic groups out). Each unit carries that country's cleaned study
// notes as `textbookContext`, so the tutor and the unit assessment teach from the
// actual notes rather than generic knowledge. A cumulative Final Exam closes it.
import { AFRICA_NOTES } from './africaGeographyNotes.js';

const COUNTRIES =
  [
    {
      "name": "Egypt",
      "blurb": "The geography of Egypt — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Egypt",
          "description": "The major cities and urban centers of Egypt — their location, history, and regional role: Port Said, Ismailia, Suez (Port Suez), Aswan & Abu Simbel, New Administrative Capital (NAC), Sharm El Sheikh & Hurghada."
        },
        {
          "title": "Physical Geography & Regions of Egypt",
          "description": "Landforms, rivers, climate zones, and regions of Egypt — including The First Cataract (Aswan, Egypt), The Second Cataract (The Great Cataract), The Third Cataract (Hannek), The Fourth Cataract (The Impassable), The Fifth Cataract, The Sixth Cataract (Sabaluka)."
        }
      ]
    },
    {
      "name": "Sudan",
      "blurb": "The geography of Sudan — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Sudan",
          "description": "The major cities and urban centers of Sudan — their location, history, and regional role: El Fasher (Al-Fashir), Nyala, Suakin, Wad Madani, Atbara, Karima & Merowe."
        },
        {
          "title": "Physical Geography & Regions of Sudan",
          "description": "Landforms, rivers, climate zones, and regions of Sudan — including The Northern Region (Nubia & The River Nile), The Eastern Region (Red Sea, Kassala, Gedaref), The Central Region (The Confluence & The Gezira), Kordofan (The Sahelian Transition), Darfur (The Western Frontier), The Eastern Desert & Red Sea Hills (Itbay)."
        }
      ]
    },
    {
      "name": "Libya",
      "blurb": "The geography of Libya — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Libya",
          "description": "The major cities and urban centers of Libya — their location, history, and regional role: Tripoli (Tarabulus), Misrata, Benghazi, Tobruk (Tubruq), Fezzan, The Aouzou Strip."
        },
        {
          "title": "Physical Geography & Regions of Libya",
          "description": "Landforms, rivers, climate zones, and regions of Libya — including The Coastal Escarpments (The Green & The Red), The Sirtica Chokepoint (The Gulf of Sirte), The Hammadas (The Rocky Plateaus), The Ergs (The Sand Seas), The Southern Massifs (The Volcanic Borders), The Gulf of Sirte (Gulf of Sidra)."
        }
      ]
    },
    {
      "name": "Tunisia",
      "blurb": "The geography of Tunisia — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Tunisia",
          "description": "The major cities and urban centers of Tunisia — their location, history, and regional role: Tunis, Bizerte (Benzert), Sousse, Sfax, Kairouan, Gabès."
        },
        {
          "title": "Physical Geography & Regions of Tunisia",
          "description": "Landforms, rivers, climate zones, and regions of Tunisia — including Cap Bon (The Sharīk Peninsula), Ras ben Sakka, Djerba (Jerba), The Sahel (The Coastal Plain), The Chotts (The Endorheic Divide), The Deep South (The Saharan Frontier)."
        }
      ]
    },
    {
      "name": "Algeria",
      "blurb": "The geography of Algeria — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Algeria",
          "description": "The major cities and urban centers of Algeria — their location, history, and regional role: Algiers (Al-Jaza’ir), Oran (Wahran), Annaba (Bône), Constantine (Qusanṭīnah), Ghardaïa, Tamanrasset (Tamanghasset)."
        },
        {
          "title": "Physical Geography & Regions of Algeria",
          "description": "Landforms, rivers, climate zones, and regions of Algeria — including Amazigh (The Umbrella Identity), Kabylia & The Kabyle (The Northern Stronghold), The Aurès (The Eastern Fortress), The M'zab Valley (The Desert Refuge)."
        }
      ]
    },
    {
      "name": "Morocco",
      "blurb": "The geography of Morocco — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Morocco",
          "description": "The major cities and urban centers of Morocco — their location, history, and regional role: Casablanca (Dar al-Bayda), Rabat & Salé, Kenitra, Fes (Fez), Meknès, Marrakech."
        },
        {
          "title": "Physical Geography & Regions of Morocco",
          "description": "Landforms, rivers, climate zones, and regions of Morocco — including The Rif Mountains (The Northern Crescent), The Middle Atlas (The Water Tower), The High Atlas (The Grand Barrier), The Anti-Atlas (The Ancient Base), The Atlantic Plains (The Gharb & Chaouia), The Saïss Plain."
        }
      ]
    },
    {
      "name": "Mauritania",
      "blurb": "The geography of Mauritania — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Mauritania",
          "description": "The major cities and urban centers of Mauritania — their location, history, and regional role: Nouakchott, Nouadhibou, Zouérat (Zouerate), Chinguetti, Rosso, Kaédi."
        },
        {
          "title": "Physical Geography & Regions of Mauritania",
          "description": "Landforms, rivers, climate zones, and regions of Mauritania — including The Atlantic Coastal Plain & The Banc d'Arguin, The Richat Structure (Guelb er Richat), Kediet ej Jill (The Magnetic Mountain)."
        }
      ]
    },
    {
      "name": "Senegal",
      "blurb": "The geography of Senegal — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Senegal",
          "description": "The major cities and urban centers of Senegal — their location, history, and regional role: Dakar, Thiès, Saint-Louis (Ndar), Touba, Ziguinchor."
        },
        {
          "title": "Physical Geography & Regions of Senegal",
          "description": "Landforms, rivers, climate zones, and regions of Senegal — including The Ferlo & Fouta Toro (The Sahelian North), The Niayes (The Coastal Microclimate), The Casamance (The Guinean South), The Kédougou Highlands (The Southeastern Outlier), The Sine-Saloum Delta (The Inverse Estuary), Lac Rose (Lake Retba)."
        }
      ]
    },
    {
      "name": "Gambia",
      "blurb": "The geography of Gambia — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Gambia",
          "description": "The major cities and urban centers of Gambia — their location, history, and regional role: Banjul, Serekunda, Brikama, Farafenni, Janjanbureh (Georgetown)."
        },
        {
          "title": "Physical Geography & Regions of Gambia",
          "description": "Landforms, rivers, climate zones, and regions of Gambia — including Banjul, Serekunda, Brikama, Farafenni, Janjanbureh (Georgetown), Kunta Kinteh Island (James Island)."
        }
      ]
    },
    {
      "name": "Mali",
      "blurb": "The geography of Mali — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Mali",
          "description": "The major cities and urban centers of Mali — their location, history, and regional role: Bamako, Ségou, Mopti, Djenné, Timbuktu (Tombouctou), Gao."
        },
        {
          "title": "Physical Geography & Regions of Mali",
          "description": "Landforms, rivers, climate zones, and regions of Mali — including The Southern Highlands (The Manding Plateau), The Sahelian Center (The Plains and the Delta), The Deep Sahara (Taoudenni & Adrar des Ifoghas), The Bandiagara Escarpment (Dogon Country), Mount Hombori (Hombori Tondo)."
        }
      ]
    },
    {
      "name": "Niger",
      "blurb": "The geography of Niger — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Niger",
          "description": "The major cities and urban centers of Niger — their location, history, and regional role: Niamey, Zinder (Damagaram), Maradi, Agadez, Arlit, Diffa."
        },
        {
          "title": "Physical Geography & Regions of Niger",
          "description": "Landforms, rivers, climate zones, and regions of Niger — including The Aïr Mountains (Massif de l'Aïr), The Ténéré Desert (The Desert of Deserts), The Djado Plateau, The Dallols (The Fossil Rivers), The Niger River & The \"W\" Bend (Southwest), The Lake Chad Basin (Southeast)."
        }
      ]
    },
    {
      "name": "Guinea-Bissau",
      "blurb": "The geography of Guinea-Bissau — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Guinea-Bissau",
          "description": "The major cities and urban centers of Guinea-Bissau — their location, history, and regional role: Bissau, Bolama, Cacheu, Bafatá, Gabú, The Bijagós (Bissagos) Archipelago."
        },
        {
          "title": "Physical Geography & Regions of Guinea-Bissau",
          "description": "Landforms, rivers, climate zones, and regions of Guinea-Bissau — including The Coastal Rias (The Drowned Valleys)."
        }
      ]
    },
    {
      "name": "Guinea",
      "blurb": "The geography of Guinea — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Guinea",
          "description": "The major cities and urban centers of Guinea — their location, history, and regional role: Conakry, Kamsar, Labé, Kankan, Nzérékoré, Maritime Guinea (Basse-Guinée)."
        },
        {
          "title": "Physical Geography & Regions of Guinea",
          "description": "Landforms, rivers, climate zones, and regions of Guinea — including Forest Guinea (Guinée Forestière)."
        }
      ]
    },
    {
      "name": "Sierra Leone",
      "blurb": "The geography of Sierra Leone — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Sierra Leone",
          "description": "The major cities and urban centers of Sierra Leone — their location, history, and regional role: Freetown, Bo, Kenema, Makeni, Koidu (Koidu-New Sembehun)."
        },
        {
          "title": "Physical Geography & Regions of Sierra Leone",
          "description": "Landforms, rivers, climate zones, and regions of Sierra Leone — including The Freetown Peninsula (The Coastal Anomaly), The Coastal Plains & The \"Bolilands\", The Eastern Highlands (The Guinea Highlands Extension)."
        }
      ]
    },
    {
      "name": "Liberia",
      "blurb": "The geography of Liberia — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Liberia",
          "description": "The major cities and urban centers of Liberia — their location, history, and regional role: Monrovia, Buchanan, Harper, Ganta, Gbarnga."
        },
        {
          "title": "Physical Geography & Regions of Liberia",
          "description": "Landforms, rivers, climate zones, and regions of Liberia — including The Coastal Plain (The Pepper Coast), The Rolling Hills (The Forest & Rubber Belt), The Northern Highlands (The Guinea Border)."
        }
      ]
    },
    {
      "name": "Cote d'Ivoire",
      "blurb": "The geography of Cote d'Ivoire — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Cote d'Ivoire",
          "description": "The major cities and urban centers of Cote d'Ivoire — their location, history, and regional role: Abidjan, San-Pédro, Yamoussoukro, Bouaké, Korhogo, Man."
        },
        {
          "title": "Physical Geography & Regions of Cote d'Ivoire",
          "description": "Landforms, rivers, climate zones, and regions of Cote d'Ivoire — including The Coastal Lagoon System (The Ebrié System), The Upper Guinean Forest (The Cocoa Belt), The Sudanian Savanna (The Dry North)."
        }
      ]
    },
    {
      "name": "Burkina Faso",
      "blurb": "The geography of Burkina Faso — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Burkina Faso",
          "description": "The major cities and urban centers of Burkina Faso — their location, history, and regional role: Ouagadougou (Ouaga), Bobo-Dioulasso, Banfora, Koudougou, Gorom-Gorom, The Sahelian Zone (The Arid North)."
        },
        {
          "title": "Physical Geography & Regions of Burkina Faso",
          "description": "Landforms, rivers, climate zones, and regions of Burkina Faso — including The Sudano-Sahelian Zone (The Mossi Plateau)."
        }
      ]
    },
    {
      "name": "Ghana",
      "blurb": "The geography of Ghana — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Ghana",
          "description": "The major cities and urban centers of Ghana — their location, history, and regional role: Accra, Tema, Kumasi, Sekondi-Takoradi, Tamale."
        },
        {
          "title": "Physical Geography & Regions of Ghana",
          "description": "Landforms, rivers, climate zones, and regions of Ghana — including Cape Coast & Elmina, The Coastal Plains & The Dahomey Gap, The Ashanti Uplands (The Kwahu Plateau), The Volta Basin (The Central Bowl), The Togo-Akwapim Ranges (The Eastern Wall), The Volta River System & Lake Volta."
        }
      ]
    },
    {
      "name": "Togo",
      "blurb": "The geography of Togo — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Togo",
          "description": "The major cities and urban centers of Togo — their location, history, and regional role: Lomé, Aného, Kpalimé, Sokodé, Kara, Dapaong."
        },
        {
          "title": "Physical Geography & Regions of Togo",
          "description": "Landforms, rivers, climate zones, and regions of Togo — including The Coastal Lagoons & The \"Terre de Barre\", The Togo Mountains (The Atakora Range), The Oti Plateau (The Northern Savanna)."
        }
      ]
    },
    {
      "name": "Benin",
      "blurb": "The geography of Benin — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Benin",
          "description": "The major cities and urban centers of Benin — their location, history, and regional role: Cotonou, Porto-Novo, Ouidah, Abomey, Parakou, Natitingou."
        },
        {
          "title": "Physical Geography & Regions of Benin",
          "description": "Landforms, rivers, climate zones, and regions of Benin — including Lake Nokoué & The Ouémé Delta, The Atakora Range."
        }
      ]
    },
    {
      "name": "Nigeria",
      "blurb": "The geography of Nigeria — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Nigeria",
          "description": "The major cities and urban centers of Nigeria — their location, history, and regional role: Lagos, Ibadan, Abeokuta, Port Harcourt, Onitsha, Enugu."
        },
        {
          "title": "Physical Geography & Regions of Nigeria",
          "description": "Landforms, rivers, climate zones, and regions of Nigeria — including The Coastal Swamps & The Niger Delta, The Tropical Rainforest Belt, The Central Pivot (The Jos Plateau), The High Plains of Hausaland (The Savanna), The Niger-Benue Confluence, The Lake Chad Basin (The Endorheic Crisis)."
        },
        {
          "title": "Peoples & Ethnic Groups of Nigeria",
          "description": "The major ethnic groups and peoples of Nigeria and their distribution — The Hausa-Fulani (The Political Behemoth), The Kanuri (The Northeastern Outlier), The Yoruba (The Urbanized Core), The Edo / Bini (The Deep Forest Anchor), The Igbo / Ibo (The Inland Traders), The Ijaw / Ijo (The Water People)."
        }
      ]
    },
    {
      "name": "Chad",
      "blurb": "The geography of Chad — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Chad",
          "description": "The major cities and urban centers of Chad — their location, history, and regional role: N'Djamena, Moundou, Sarh, Abéché, Faya-Largeau, The Sara (The Demographic Giant)."
        },
        {
          "title": "Physical Geography & Regions of Chad",
          "description": "Landforms, rivers, climate zones, and regions of Chad — including The Kanembu (The Lake Dwellers), The Tibesti Mountains, The Ennedi Plateau, The Lakes of Ounianga, The Bodélé Depression, The Chari-Logone River System."
        }
      ]
    },
    {
      "name": "Cameroon",
      "blurb": "The geography of Cameroon — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Cameroon",
          "description": "The major cities and urban centers of Cameroon — their location, history, and regional role: Douala, Kribi, Limbe (Historically Victoria), Yaoundé, Bamenda, Buea."
        },
        {
          "title": "Physical Geography & Regions of Cameroon",
          "description": "Landforms, rivers, climate zones, and regions of Cameroon — including Mount Cameroon (Fako), The \"Killer Lakes\" (Limnic Eruptions), The South Cameroon Plateau, The Adamawa Plateau (The Water Tower), The Northern Plains & Mandara Mountains."
        }
      ]
    },
    {
      "name": "Equatorial Guinea",
      "blurb": "The geography of Equatorial Guinea — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Equatorial Guinea",
          "description": "The major cities and urban centers of Equatorial Guinea — their location, history, and regional role: Malabo, Bata, Ciudad de la Paz (Formerly Oyala), Mongomo, Ebebiyín."
        },
        {
          "title": "Physical Geography & Regions of Equatorial Guinea",
          "description": "Landforms, rivers, climate zones, and regions of Equatorial Guinea — including Bioko Island (The Northern Anchor), Annobón Island (The Hemispheric Outlier), The Coastal Plain, The Crystal Mountains (Montañas de Cristal), The Interior Plateau (The Jungle Core)."
        }
      ]
    },
    {
      "name": "Gabon",
      "blurb": "The geography of Gabon — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Gabon",
          "description": "The major cities and urban centers of Gabon — their location, history, and regional role: Libreville, Port-Gentil, Lambaréné, Franceville, Moanda."
        },
        {
          "title": "Physical Geography & Regions of Gabon",
          "description": "Landforms, rivers, climate zones, and regions of Gabon — including The Coastal Plain & The Lagoon Coast, The Mountain Walls (Cristal & Chaillu), The Bateke Plateau (The Geographic Anomaly)."
        }
      ]
    },
    {
      "name": "Central African Republic",
      "blurb": "The geography of Central African Republic — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Central African Republic",
          "description": "The major cities and urban centers of Central African Republic — their location, history, and regional role: Bangui, Bimbo, Berbérati, Bouar, Bambari, Bria."
        },
        {
          "title": "Physical Geography & Regions of Central African Republic",
          "description": "Landforms, rivers, climate zones, and regions of Central African Republic — including The Yadé Massif (The Western Highlands), The Bongo Massif (The Eastern Highlands), The Congo Basin Rainforest (The Deep South), The Sudanian Savanna (The Vast Center)."
        }
      ]
    },
    {
      "name": "Republic of the Congo",
      "blurb": "The geography of Republic of the Congo — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Republic of the Congo",
          "description": "The major cities and urban centers of Republic of the Congo — their location, history, and regional role: Brazzaville, Pointe-Noire, Dolisie (Loubomo), Nkayi (Jacob), Ouesso, Owando."
        },
        {
          "title": "Physical Geography & Regions of Republic of the Congo",
          "description": "Landforms, rivers, climate zones, and regions of Republic of the Congo — including The Coastal Plain & Mangroves, The Mayombe Mountains, The Niari Valley, The Batéké Plateau, The \"Cuvette\" (The Central Basin), The Likouala Swamp-Forests."
        }
      ]
    },
    {
      "name": "DR Congo",
      "blurb": "The geography of DR Congo — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of DR Congo",
          "description": "The major cities and urban centers of DR Congo — their location, history, and regional role: Kinshasa, Matadi, Lubumbashi, Mbuji-Mayi, Goma, Bukavu."
        },
        {
          "title": "Physical Geography & Regions of DR Congo",
          "description": "Landforms, rivers, climate zones, and regions of DR Congo — including The Mountains of the Moon (Ruwenzori), The Virunga Volcanoes."
        }
      ]
    },
    {
      "name": "South Sudan",
      "blurb": "The geography of South Sudan — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of South Sudan",
          "description": "The major cities and urban centers of South Sudan — their location, history, and regional role: Juba, Ramciel, Bentiu, Malakal, Bor, Nimule."
        },
        {
          "title": "Physical Geography & Regions of South Sudan",
          "description": "Landforms, rivers, climate zones, and regions of South Sudan — including The Imatong Mountains (The Alpine Anchor), The Ironstone Plateau (Jabal Hadid), The Boma Plateau (The Eastern Bastion)."
        }
      ]
    },
    {
      "name": "Ethiopia",
      "blurb": "The geography of Ethiopia — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Ethiopia",
          "description": "The major cities and urban centers of Ethiopia — their location, history, and regional role: Addis Ababa, Gondar, Lalibela, Bahir Dar, Mekelle, Harar."
        },
        {
          "title": "Physical Geography & Regions of Ethiopia",
          "description": "Landforms, rivers, climate zones, and regions of Ethiopia — including Oromia, Amhara, Tigray, Somali Region (The Ogaden), Afar Region, Benishangul-Gumuz."
        }
      ]
    },
    {
      "name": "Eritrea",
      "blurb": "The geography of Eritrea — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Eritrea",
          "description": "The major cities and urban centers of Eritrea — their location, history, and regional role: Asmara, Massawa, Assab, Keren, Nakfa."
        },
        {
          "title": "Physical Geography & Regions of Eritrea",
          "description": "Landforms, rivers, climate zones, and regions of Eritrea."
        }
      ]
    },
    {
      "name": "Djibouti",
      "blurb": "The geography of Djibouti — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Djibouti",
          "description": "The major cities and urban centers of Djibouti — their location, history, and regional role: Djibouti City, Tadjoura, Obock, Ali Sabieh, Dikhil, Mousa Ali (The Peak)."
        },
        {
          "title": "Physical Geography & Regions of Djibouti",
          "description": "Landforms, rivers, climate zones, and regions of Djibouti — including Lake Assal (The African Floor), Lake Abbe (The Apocalyptic Terminus), The Goda Mountains, The Grand Bara Desert, The Gulf of Tadjoura & Ghoubbet-el-Kharab."
        }
      ]
    },
    {
      "name": "Somalia",
      "blurb": "The geography of Somalia — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Somalia",
          "description": "The major cities and urban centers of Somalia — their location, history, and regional role: Hargeisa, Berbera, Bosaso, Garowe, Mogadishu, Kismayo."
        },
        {
          "title": "Physical Geography & Regions of Somalia",
          "description": "Landforms, rivers, climate zones, and regions of Somalia — including The Ogo Mountains and Cal Madow, The Haud Plateau, The Mudug Plain, The Juba River, The Shabelle River (The \"Disappearing\" River)."
        }
      ]
    },
    {
      "name": "Kenya",
      "blurb": "The geography of Kenya — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Kenya",
          "description": "The major cities and urban centers of Kenya — their location, history, and regional role: Nairobi, Mombasa, Lamu, Nakuru, Eldoret, Kisumu."
        },
        {
          "title": "Physical Geography & Regions of Kenya",
          "description": "Landforms, rivers, climate zones, and regions of Kenya — including Lake Turkana (The Jade Sea), The Alkaline Lake Chain, The Lake Victoria Basin, The Northern and Eastern Deserts (The Nyika Plateau), The Coastal Plain."
        }
      ]
    },
    {
      "name": "Uganda",
      "blurb": "The geography of Uganda — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Uganda",
          "description": "The major cities and urban centers of Uganda — their location, history, and regional role: Kampala, Entebbe, Jinja, Hoima, Gulu, Mbarara."
        },
        {
          "title": "Physical Geography & Regions of Uganda",
          "description": "Landforms, rivers, climate zones, and regions of Uganda — including Lake Victoria (The Reservoir), Lake Kyoga (The Central Sponge), Murchison Falls (The Ultimate Chokepoint), The Rwenzori Mountains (The Mountains of the Moon), Lake Albert & Lake Edward."
        }
      ]
    },
    {
      "name": "Rwanda",
      "blurb": "The geography of Rwanda — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Rwanda",
          "description": "The major cities and urban centers of Rwanda — their location, history, and regional role: Kigali, Musanze (Ruhengeri), Rubavu (Gisenyi), Huye (Butare), Rusizi (Cyangugu), Nyagatare."
        },
        {
          "title": "Physical Geography & Regions of Rwanda",
          "description": "Landforms, rivers, climate zones, and regions of Rwanda — including The Virunga Mountains (The Volcanic Crown), Lake Kivu, The Kagera River & The Nile Origin."
        }
      ]
    },
    {
      "name": "Burundi",
      "blurb": "The geography of Burundi — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Burundi",
          "description": "The major cities and urban centers of Burundi — their location, history, and regional role: Bujumbura, Gitega, Ngozi, Rumonge, Kayanza."
        },
        {
          "title": "Physical Geography & Regions of Burundi",
          "description": "Landforms, rivers, climate zones, and regions of Burundi."
        }
      ]
    },
    {
      "name": "Tanzania",
      "blurb": "The geography of Tanzania — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Tanzania",
          "description": "The major cities and urban centers of Tanzania — their location, history, and regional role: Dar es Salaam, Zanzibar City (Stone Town), Dodoma, Arusha, Mwanza, Kigoma."
        },
        {
          "title": "Physical Geography & Regions of Tanzania",
          "description": "Landforms, rivers, climate zones, and regions of Tanzania — including The Western Rift (Albertine), The Eastern Rift (Gregory), Mount Kilimanjaro (The Roof of Africa), Ngorongoro Crater, Ol Doinyo Lengai (Mountain of God), The Serengeti Plain."
        }
      ]
    },
    {
      "name": "Malawi",
      "blurb": "The geography of Malawi — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Malawi",
          "description": "The major cities and urban centers of Malawi — their location, history, and regional role: Lilongwe, Blantyre, Zomba, Mzuzu, Mangochi (Fort Johnston), Nkhotakota."
        },
        {
          "title": "Physical Geography & Regions of Malawi",
          "description": "Landforms, rivers, climate zones, and regions of Malawi — including Lake Malawi (The \"Calendar Lake\"), The Nyika Plateau (The North), The Viphya Plateau, Mount Mulanje (The Island in the Sky), The Zomba Plateau, The Shire River (The Only Exit)."
        }
      ]
    },
    {
      "name": "Zambia",
      "blurb": "The geography of Zambia — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Zambia",
          "description": "The major cities and urban centers of Zambia — their location, history, and regional role: Lusaka, Ndola, Kitwe, Livingstone, Kabwe, Chipata (Fort Jameson)."
        },
        {
          "title": "Physical Geography & Regions of Zambia",
          "description": "Landforms, rivers, climate zones, and regions of Zambia — including The Kafue River (The Internal River), The Luangwa River (The Rift River), Lake Kariba (The Battery), Lake Bangweulu (The \"Where the Water Meets the Sky\"), Lake Tanganyika & Lake Mweru."
        }
      ]
    },
    {
      "name": "Angola",
      "blurb": "The geography of Angola — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Angola",
          "description": "The major cities and urban centers of Angola — their location, history, and regional role: Luanda, Lobito, Namibe (Moçâmedes), Huambo, Lubango, Mbanza Kongo."
        },
        {
          "title": "Physical Geography & Regions of Angola",
          "description": "Landforms, rivers, climate zones, and regions of Angola — including The Kwanza River (The National Artery), The Okavango (Cubango) River, The Cunene River."
        }
      ]
    },
    {
      "name": "Mozambique",
      "blurb": "The geography of Mozambique — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Mozambique",
          "description": "The major cities and urban centers of Mozambique — their location, history, and regional role: Maputo, Matola, Beira, Tete, Nampula & Nacala, Pemba."
        },
        {
          "title": "Physical Geography & Regions of Mozambique",
          "description": "Landforms, rivers, climate zones, and regions of Mozambique — including Island of Mozambique (Ilha de Moçambique), The Save (Sabi) River, The Rovuma River, Delagoa Bay (Maputo Bay)."
        }
      ]
    },
    {
      "name": "Zimbabwe",
      "blurb": "The geography of Zimbabwe — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Zimbabwe",
          "description": "The major cities and urban centers of Zimbabwe — their location, history, and regional role: Harare, Bulawayo, Gweru, Kwekwe & Kadoma, Mutare, Masvingo."
        },
        {
          "title": "Physical Geography & Regions of Zimbabwe",
          "description": "Landforms, rivers, climate zones, and regions of Zimbabwe — including Victoria Falls, The Eastern Highlands, The Zambezi & Victoria Falls."
        }
      ]
    },
    {
      "name": "Botswana",
      "blurb": "The geography of Botswana — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Botswana",
          "description": "The major cities and urban centers of Botswana — their location, history, and regional role: Gaborone, Francistown, Selebi-Phikwe, Lobatse, Maun, Kasane."
        },
        {
          "title": "Physical Geography & Regions of Botswana",
          "description": "Landforms, rivers, climate zones, and regions of Botswana."
        }
      ]
    },
    {
      "name": "Namibia",
      "blurb": "The geography of Namibia — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Namibia",
          "description": "The major cities and urban centers of Namibia — their location, history, and regional role: Windhoek, Swakopmund, Lüderitz, Oshakati & Ondangwa, Rundu & Katima Mulilo, Tsumeb."
        },
        {
          "title": "Physical Geography & Regions of Namibia",
          "description": "Landforms, rivers, climate zones, and regions of Namibia — including Walvis Bay, Sossusvlei and the \"Star Dunes\", The Brandberg Massif, The Fish River Canyon, The Kalahari Basin (East)."
        }
      ]
    },
    {
      "name": "South Africa",
      "blurb": "The geography of South Africa — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of South Africa",
          "description": "The major cities and urban centers of South Africa — their location, history, and regional role: Pretoria (Tshwane), Bloemfontein, Johannesburg, Durban (eThekwini), Gqeberha (Port Elizabeth), Nelspruit (Mbombela)."
        },
        {
          "title": "Physical Geography & Regions of South Africa",
          "description": "Landforms, rivers, climate zones, and regions of South Africa — including Gauteng, Johannesburg, Pretoria, Soweto, Western Cape, Cape Town."
        }
      ]
    },
    {
      "name": "Lesotho",
      "blurb": "The geography of Lesotho — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Lesotho",
          "description": "The major cities and urban centers of Lesotho — their location, history, and regional role: Maseru, Teyateyaneng (TY), Hlotse (Leribe), Mafeteng, Mokhotlong, Qacha's Nek."
        },
        {
          "title": "Physical Geography & Regions of Lesotho",
          "description": "Landforms, rivers, climate zones, and regions of Lesotho — including The Orange (Senqu) River, The Lesotho Highlands Water Project (LHWP)."
        }
      ]
    },
    {
      "name": "eSwatini",
      "blurb": "The geography of eSwatini — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of eSwatini",
          "description": "The major cities and urban centers of eSwatini — their location, history, and regional role: Mbabane, Lobamba, Manzini, Simunye, Ngwenya, Siteki."
        },
        {
          "title": "Physical Geography & Regions of eSwatini",
          "description": "Landforms, rivers, climate zones, and regions of eSwatini — including The Lebombo Plateau."
        }
      ]
    },
    {
      "name": "Madagascar",
      "blurb": "The geography of Madagascar — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Madagascar",
          "description": "The major cities and urban centers of Madagascar — their location, history, and regional role: Antananarivo, Antsirabe, Ambohimangakely, Fianarantsoa, Manakara, Ambositra."
        },
        {
          "title": "Physical Geography & Regions of Madagascar",
          "description": "Landforms, rivers, climate zones, and regions of Madagascar — including The Betsiboka Delta: \"The Bleeding Island\"."
        }
      ]
    },
    {
      "name": "Comoros",
      "blurb": "The geography of Comoros — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Comoros",
          "description": "The major cities and urban centers of Comoros — their location, history, and regional role: Grande Comore (Ngazidja), Moroni, Mitsamiouli, Iconi, Anjouan (Ndzuwani), Mutsamudu."
        },
        {
          "title": "Physical Geography & Regions of Comoros",
          "description": "Landforms, rivers, climate zones, and regions of Comoros."
        }
      ]
    },
    {
      "name": "Seychelles",
      "blurb": "The geography of Seychelles — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Seychelles",
          "description": "The major cities and urban centers of Seychelles — their location, history, and regional role: Mahé, Victoria, De Quincey, Anse Boileau, Praslin, La Digue."
        },
        {
          "title": "Physical Geography & Regions of Seychelles",
          "description": "Landforms, rivers, climate zones, and regions of Seychelles — including The Mascarene Plateau."
        }
      ]
    },
    {
      "name": "Reunion",
      "blurb": "The geography of Reunion — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Reunion",
          "description": "The major cities and urban centers of Reunion — their location, history, and regional role: Piton des Neiges (The Extinct Elder), Piton de la Fournaise (The Active Giant), Saint-Denis, Saint-Paul, Saint-Pierre."
        },
        {
          "title": "Physical Geography & Regions of Reunion",
          "description": "Landforms, rivers, climate zones, and regions of Reunion."
        }
      ]
    },
    {
      "name": "Mauritius",
      "blurb": "The geography of Mauritius — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Mauritius",
          "description": "The major cities and urban centers of Mauritius — their location, history, and regional role: The \"Underwater Waterfall\" Illusion, Chamarel: The Seven Coloured Earths, Port Louis, Pailles, Pointe aux Sables, Grand Baie."
        },
        {
          "title": "Physical Geography & Regions of Mauritius",
          "description": "Landforms, rivers, climate zones, and regions of Mauritius — including Grand Port Bay: The Defensive Basin, Blue Bay Marine Park."
        }
      ]
    },
    {
      "name": "Sao Tome and Principe",
      "blurb": "The geography of Sao Tome and Principe — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Sao Tome and Principe",
          "description": "The major cities and urban centers of Sao Tome and Principe — their location, history, and regional role: The \"Cameroon Line\" Context, The High Peaks, São Tomé, Trindade, Neves, Santo António."
        },
        {
          "title": "Physical Geography & Regions of Sao Tome and Principe",
          "description": "Landforms, rivers, climate zones, and regions of Sao Tome and Principe."
        }
      ]
    },
    {
      "name": "Cabo Verde",
      "blurb": "The geography of Cabo Verde — its cities, physical landscape, regions, and peoples.",
      "lessons": [
        {
          "title": "Cities & Settlements of Cabo Verde",
          "description": "The major cities and urban centers of Cabo Verde — their location, history, and regional role."
        },
        {
          "title": "Physical Geography & Regions of Cabo Verde",
          "description": "Landforms, rivers, climate zones, and regions of Cabo Verde."
        }
      ]
    }
  ];

const FINAL_EXAM_UNIT = {
  title: 'Final Exam - Comprehensive African Geography',
  description: 'Cumulative final exam across all 55 countries and territories: cities, physical geography, regions, and peoples of the entire continent, organized by region.',
  textbookContext: "AFRICA — CONTINENTAL SYNTHESIS (cumulative final-exam scope)\n\nThis exam is cumulative across every country and territory in the course. Review by region:\n\n- North Africa & the Maghreb: Egypt, Libya, Tunisia, Algeria, Morocco, Sudan. The Nile and its cataracts, the Suez Canal, the Sahara, the Atlas Mountains, the Mediterranean coast. Cities: Cairo, Alexandria, Tripoli, Tunis, Algiers, Casablanca, Rabat, Khartoum (Blue + White Nile confluence).\n- The Sahel & West Africa: Mauritania, Senegal, Gambia, Mali, Niger, Guinea-Bissau, Guinea, Sierra Leone, Liberia, Cote d'Ivoire, Burkina Faso, Ghana, Togo, Benin, Nigeria. The Niger River and its inland delta, Lake Chad, the Sahel belt, the Dahomey Gap, the Jos Plateau. Cities: Dakar, Bamako, Lagos, Accra, Abidjan, Kano. Nigeria's major peoples: Hausa-Fulani, Yoruba, Igbo.\n- Central Africa: Chad, Cameroon, Equatorial Guinea, Gabon, Central African Republic, Republic of the Congo, DR Congo. The Congo River basin and rainforest, the Congo's cataracts, Mount Cameroon. Cities: Kinshasa, Brazzaville, Yaounde, Libreville.\n- East Africa & the Horn: South Sudan, Ethiopia, Eritrea, Djibouti, Somalia, Kenya, Uganda, Rwanda, Burundi, Tanzania. The Great Rift Valley (Eastern + Western branches), the Ethiopian Highlands, Lake Victoria, Lake Tanganyika, Mount Kilimanjaro, Mount Kenya, the Afar Triangle. Cities: Addis Ababa, Nairobi, Mombasa, Dar es Salaam, Kampala.\n- Southern Africa: Malawi, Zambia, Angola, Mozambique, Zimbabwe, Botswana, Namibia, South Africa, Lesotho, eSwatini. The Zambezi and Victoria Falls, the Kalahari and Namib deserts, the Okavango Delta, the Drakensberg, the Orange (Gariep) River, the Witwatersrand. Cities: Johannesburg, Cape Town, Pretoria, Luanda, Maputo, Harare, Windhoek.\n- Island nations & territories: Madagascar, Comoros, Seychelles, Reunion, Mauritius, Sao Tome and Principe, Cabo Verde. Volcanic vs continental islands, the Mozambique Channel, monsoon climates, endemic biodiversity.\n\nBe able to: locate each country and its capital; identify the major rivers, deserts, mountain ranges, lakes and the Rift Valley; match cities to countries and regions; and explain the major peoples and regional divisions covered in the notes.",
  lessons: [
    {
      title: 'Continental Review - Countries, Capitals & Regions',
      description: 'Synthesize the whole course region by region - North Africa and the Maghreb, the Sahel and West Africa, Central Africa, East Africa and the Horn, Southern Africa, and the island nations - matching each country to its capital, major cities, and regional grouping.',
    },
    {
      title: 'Continental Review - Rivers, Deserts, Mountains & the Rift Valley',
      description: "Cross-country physical geography: the Nile, Niger, Congo, Zambezi and Orange river systems; the Sahara, Kalahari and Namib deserts; the Great Rift Valley, the Atlas, the Ethiopian Highlands and the Drakensberg; and Africa's great lakes and waterfalls.",
    },
  ],
};

export const AFRICA_GEOGRAPHY_COURSE = {
  slug: 'africa-geography',
  title: 'Africa Geography',
  description: 'A country-by-country tour of Africa, built from the IGC Africa study notes. Every country and territory gets its own unit covering cities, physical geography, regions, and peoples, capped by a cumulative final exam over the whole continent.',
  subject: 'geography',
  grade: '9-12',
  difficulty: 'advanced',
  textbook: 'IGC Africa Geography study notes',
  units: [
    ...COUNTRIES.map((c) => ({
      title: c.name,
      description: c.blurb,
      textbookContext: AFRICA_NOTES[c.name] || null,
      lessons: c.lessons,
    })),
    FINAL_EXAM_UNIT,
  ],
};
