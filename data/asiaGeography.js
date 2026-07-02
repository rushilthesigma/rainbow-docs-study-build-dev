// PAUSD-style elective: "Asia Geography". One unit per country, ordered by
// region (Levant & Eastern Mediterranean -> Mesopotamia & the Iranian Plateau ->
// Arabian Peninsula -> Central Asia -> South Asia -> East Asia -> Southeast
// Asia). Each unit has a Cities lesson and a Physical Geography & Regions
// lesson (plus an extra lesson where a country warrants it, e.g. India's
// states, China's provinces, Japan's islands, Indonesia's archipelago, the
// Philippines' island groups, or the UAE's seven emirates). A cumulative Final
// Exam closes it.
//
// Unlike the Africa and Europe courses (auto-generated from the user's IGC
// study notes), this course is authored directly: the lesson descriptions
// carry the competition-level place names and the AI teaches from those. There
// is no per-country notes file yet — if IGC Asia notes arrive later, add an
// asiaGeographyNotes.js and wire textbookContext exactly like europeGeography.js.
//
// The Caucasus (Armenia, Georgia, Azerbaijan) and Turkey are covered in the
// Europe Geography course, so this course begins at the Levant.

const COUNTRIES =
  [
    // ================= The Levant & Eastern Mediterranean =================
    {
      "name": "Cyprus",
      "blurb": "The geography of Cyprus — the divided island of the Troodos and the Green Line.",
      "lessons": [
        {
          "title": "Cities & Settlements of Cyprus",
          "description": "The major cities and urban centers of Cyprus — their location, history, and regional role: Nicosia (Lefkosia, the last divided capital in the world), Limassol, Larnaca, Paphos, and the northern towns of Famagusta and Kyrenia."
        },
        {
          "title": "Physical Geography & Regions of Cyprus",
          "description": "Landforms, rivers, climate zones, and regions of Cyprus — including the Troodos Massif (Mount Olympus) and its world-famous ophiolite geology, the Kyrenia (Pentadaktylos) Range, the Mesaoria plain between them, the salt lakes of Larnaca and Akrotiri, the Green Line partition, and the British Sovereign Base Areas of Akrotiri and Dhekelia."
        }
      ]
    },
    {
      "name": "Syria",
      "blurb": "The geography of Syria — its ancient cities, the Orontes, and the Euphrates.",
      "lessons": [
        {
          "title": "Cities & Settlements of Syria",
          "description": "The major cities and urban centers of Syria — their location, history, and regional role: Damascus (among the oldest continuously inhabited cities, on the Barada River and the Ghouta oasis), Aleppo, Homs, Hama (the giant norias water wheels), the coastal ports of Latakia and Tartus, Deir ez-Zor and Raqqa on the Euphrates, and the desert caravan city of Palmyra (Tadmur)."
        },
        {
          "title": "Physical Geography & Regions of Syria",
          "description": "Landforms, rivers, climate zones, and regions of Syria — including the coastal An-Nusayriyah range, the Homs Gap, the Anti-Lebanon and Mount Hermon on the Lebanese border, the Orontes river flowing north, the Euphrates with the Tabqa Dam and Lake Assad, the Jabal al-Druze volcanic south, and the Syrian Desert (Badiya)."
        }
      ]
    },
    {
      "name": "Lebanon",
      "blurb": "The geography of Lebanon — twin mountain walls and the Beqaa between them.",
      "lessons": [
        {
          "title": "Cities & Settlements of Lebanon",
          "description": "The major cities and urban centers of Lebanon — their location, history, and regional role: Beirut, Tripoli (Trablous), the ancient Phoenician ports of Sidon (Saida), Tyre (Sour) and Byblos (Jbeil, a contender for the oldest continuously inhabited city), Baalbek in the Beqaa, and Zahlé."
        },
        {
          "title": "Physical Geography & Regions of Lebanon",
          "description": "Landforms, rivers, climate zones, and regions of Lebanon — including the Mount Lebanon range (Qurnat as Sawda', the highest point of the Levant), the Anti-Lebanon on the Syrian border, the Beqaa Valley rift between the two ranges, the Litani River, the famous Cedars of God groves, and the narrow Mediterranean coastal strip."
        }
      ]
    },
    {
      "name": "Israel",
      "blurb": "The geography of Israel — from the Galilee to the Negev and the lowest point on Earth.",
      "lessons": [
        {
          "title": "Cities & Settlements of Israel",
          "description": "The major cities and urban centers of Israel — their location, history, and regional role: Jerusalem (the contested capital on the Judean ridge), Tel Aviv-Yafo, Haifa on the slopes of Mount Carmel, Beersheba (capital of the Negev), the Red Sea port of Eilat, Nazareth, and Acre (Akko)."
        },
        {
          "title": "Physical Geography & Regions of Israel",
          "description": "Landforms, rivers, climate zones, and regions of Israel — including the Dead Sea (the lowest land surface on Earth), the Jordan Rift Valley, the Sea of Galilee (Kinneret, the lowest freshwater lake on Earth), the Negev desert and the Makhtesh Ramon erosion crater, Mount Meron and the Galilee highlands, the coastal plain, and the National Water Carrier."
        }
      ]
    },
    {
      "name": "Palestine",
      "blurb": "The geography of Palestine — the West Bank highlands and the Gaza coastal strip.",
      "lessons": [
        {
          "title": "Cities & Settlements of Palestine",
          "description": "The major cities and urban centers of Palestine — their location, history, and regional role: Ramallah (the administrative center), East Jerusalem (the claimed capital), Gaza City, Hebron (Al-Khalil), Nablus, Bethlehem, and Jericho (the lowest city on Earth and among the oldest)."
        },
        {
          "title": "Physical Geography & Regions of Palestine",
          "description": "Landforms, climate zones, and regions of Palestine — including the West Bank hill spine of Judea and Samaria, the Jordan Valley and the Dead Sea shore, the wilderness slopes east of Jerusalem, and the flat, densely populated Gaza Strip on the Mediterranean coast."
        }
      ]
    },
    {
      "name": "Jordan",
      "blurb": "The geography of Jordan — the Rift edge, Petra, and the eastern desert.",
      "lessons": [
        {
          "title": "Cities & Settlements of Jordan",
          "description": "The major cities and urban centers of Jordan — their location, history, and regional role: Amman (ancient Philadelphia, built across steep jabals), Zarqa, Irbid, Aqaba (the country's only seaport, on the Red Sea), Salt, Madaba (the mosaic map city), and Wadi Musa, the gateway to Petra."
        },
        {
          "title": "Physical Geography & Regions of Jordan",
          "description": "Landforms, rivers, climate zones, and regions of Jordan — including the Jordan Rift Valley and the Dead Sea shore, the highland edge carrying the ancient King's Highway, the sandstone desert of Wadi Rum with Jabal Umm ad Dami (the highest point), the black basalt Harrat north, the eastern desert with the Azraq oasis, and the Yarmouk and Zarqa rivers."
        }
      ]
    },

    // ================= Mesopotamia & the Iranian Plateau =================
    {
      "name": "Iraq",
      "blurb": "The geography of Iraq — Mesopotamia between the Tigris and Euphrates.",
      "lessons": [
        {
          "title": "Cities & Settlements of Iraq",
          "description": "The major cities and urban centers of Iraq — their location, history, and regional role: Baghdad (the Abbasid Round City on the Tigris), Basra (the Shatt al-Arab port, the 'Venice of the East'), Mosul on the Tigris opposite ancient Nineveh, Erbil (Hawler, with one of the oldest continuously inhabited citadels), Kirkuk, the Shia shrine cities of Najaf and Karbala, and Sulaymaniyah in Kurdistan."
        },
        {
          "title": "Physical Geography & Regions of Iraq",
          "description": "Landforms, rivers, climate zones, and regions of Iraq — including the Tigris and Euphrates twin rivers and their confluence at the Shatt al-Arab, the Mesopotamian alluvial plain, the restored southern Marshes (the Ahwar), the Zagros mountain wall of Iraqi Kurdistan (Cheekha Dar), the Al-Jazira upland between the rivers, and the western desert plateau."
        }
      ]
    },
    {
      "name": "Iran",
      "blurb": "The geography of Iran — the plateau fortress between the Alborz and the Zagros.",
      "lessons": [
        {
          "title": "Cities & Settlements of Iran",
          "description": "The major cities and urban centers of Iran — their location, history, and regional role: Tehran beneath the Alborz wall, the shrine metropolis of Mashhad, Isfahan ('half the world'), Shiraz (gateway to Persepolis), Tabriz, Qom, Ahvaz in oil-rich Khuzestan, the Strait-of-Hormuz port of Bandar Abbas, and the desert windcatcher city of Yazd."
        },
        {
          "title": "Physical Geography & Regions of Iran",
          "description": "Landforms, rivers, climate zones, and regions of Iran — including the Alborz range and Mount Damavand (the highest volcano in Asia), the long fold ridges of the Zagros, the central deserts Dasht-e Kavir and Dasht-e Lut (holder of the hottest recorded land-surface temperatures), the humid Caspian littoral, shrinking Lake Urmia, the Karun (the only navigable river), the qanat underground irrigation system, and the Strait of Hormuz chokepoint."
        }
      ]
    },

    // ================= The Arabian Peninsula =================
    {
      "name": "Saudi Arabia",
      "blurb": "The geography of Saudi Arabia — the Empty Quarter, the Hejaz, and the oil east.",
      "lessons": [
        {
          "title": "Cities & Settlements of Saudi Arabia",
          "description": "The major cities and urban centers of Saudi Arabia — their location, history, and regional role: Riyadh on the Najd plateau, Jeddah (the Red Sea gateway to Mecca), the holy cities of Mecca and Medina, the Eastern Province oil conurbation of Dammam, Dhahran and Khobar, the mountain resort of Taif, Abha in the Asir highlands, and the NEOM project on the Gulf of Aqaba."
        },
        {
          "title": "Physical Geography & Regions of Saudi Arabia",
          "description": "Landforms, deserts, climate zones, and regions of Saudi Arabia — including the Rub' al Khali (the Empty Quarter, the largest contiguous sand desert), the An Nafud in the north and the Ad Dahna arc linking them, the Hejaz and Asir escarpments along the Red Sea (Jabal Sawda), the black harrat lava fields, a land of wadis with no permanent rivers, and the Ghawar field, the largest conventional oil field on Earth."
        }
      ]
    },
    {
      "name": "Yemen",
      "blurb": "The geography of Yemen — Arabia's highland corner and the island of Socotra.",
      "lessons": [
        {
          "title": "Cities & Settlements of Yemen",
          "description": "The major cities and urban centers of Yemen — their location, history, and regional role: Sana'a (the old walled city at 2,300 meters, among the highest capitals), the volcanic crater port of Aden, Taiz, the Red Sea port of Al Hudaydah, Mukalla on the Arabian Sea, the mud-brick tower city of Shibam ('the Manhattan of the Desert'), and ancient Marib of the Sabaeans."
        },
        {
          "title": "Physical Geography & Regions of Yemen",
          "description": "Landforms, climate zones, and regions of Yemen — including the Yemeni Highlands and Jabal an-Nabi Shu'ayb (the highest peak of the Arabian Peninsula), the hot Tihamah coastal plain, the great canyon-oasis system of the Hadhramaut, the Bab-el-Mandeb strait between Arabia and Africa, and Socotra, the 'alien island' of dragon's blood trees and extreme endemism."
        }
      ]
    },
    {
      "name": "Oman",
      "blurb": "The geography of Oman — the Hajar wall, the monsoon south, and the Musandam fjords.",
      "lessons": [
        {
          "title": "Cities & Settlements of Oman",
          "description": "The major cities and urban centers of Oman — their location, history, and regional role: Muscat and the Muttrah corniche, Salalah in monsoon-touched Dhofar, the oasis fort city of Nizwa beneath the Hajar, the old maritime hub of Sohar, the dhow-building port of Sur, and Khasab in the Musandam exclave on the Strait of Hormuz."
        },
        {
          "title": "Physical Geography & Regions of Oman",
          "description": "Landforms, climate zones, and regions of Oman — including the Al Hajar Mountains (Jebel Shams and the terraced Jebel Akhdar) with the world's finest exposed ophiolite, the Musandam Peninsula fjords ('the Norway of Arabia'), the Wahiba (Sharqiya) Sands, the Dhofar khareef monsoon that turns the south green each summer, the UNESCO-listed aflaj irrigation channels, and the turtle beaches of Ras al Jinz."
        }
      ]
    },
    {
      "name": "United Arab Emirates",
      "blurb": "The geography of the UAE — seven emirates between the dunes and the Gulf.",
      "lessons": [
        {
          "title": "Cities & Settlements of the United Arab Emirates",
          "description": "The major cities and urban centers of the UAE — their location, history, and regional role: Abu Dhabi (the island capital), Dubai (the creek, the Burj Khalifa, and the Palm archipelagos), Sharjah, the garden oasis city of Al Ain beneath Jebel Hafeet, Ras Al Khaimah, and Fujairah, the only major city wholly on the Gulf of Oman coast."
        },
        {
          "title": "The Seven Emirates",
          "description": "The seven emirates of the federation — Abu Dhabi, Dubai, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah, and Fujairah — their capitals, exclaves and shared enclaves, relative size and wealth, and the split between the Gulf coast and the Hajar-backed east coast."
        },
        {
          "title": "Physical Geography & Regions of the United Arab Emirates",
          "description": "Landforms, climate zones, and regions of the UAE — including the Liwa Oasis crescent on the edge of the Rub' al Khali, the sabkha salt flats of the coast, the Hajar mountain spine of the east, the artificial island projects of Dubai, and the strategic position along the Strait of Hormuz."
        }
      ]
    },
    {
      "name": "Qatar",
      "blurb": "The geography of Qatar — the peninsula on a peninsula and the great gas field.",
      "lessons": [
        {
          "title": "Cities & Settlements of Qatar",
          "description": "The major cities and urban centers of Qatar — their location, history, and regional role: Doha (West Bay and Souq Waqif), the planned city of Lusail, Al Rayyan, the old pearling port of Al Wakrah, Al Khor, and the western industrial town of Dukhan."
        },
        {
          "title": "Physical Geography & Regions of Qatar",
          "description": "Landforms, climate zones, and regions of Qatar — including the low desert peninsula jutting from Arabia into the Gulf, the Khor Al Adaid 'Inland Sea' tidal embayment shared with Saudi Arabia, the singing barchan dunes of the south, the Jebel Dukhan ridge, a country with no rivers at all, and the North Field, the largest non-associated natural gas field on Earth (shared with Iran's South Pars)."
        }
      ]
    },
    {
      "name": "Bahrain",
      "blurb": "The geography of Bahrain — the island of Dilmun and the two seas.",
      "lessons": [
        {
          "title": "Cities & Settlements of Bahrain",
          "description": "The major cities and urban centers of Bahrain — their location, history, and regional role: Manama, Muharraq (the old pearling capital and its UNESCO pearling path), Riffa, the planned towns of Isa Town and Hamad Town, and industrial Sitra."
        },
        {
          "title": "Physical Geography & Regions of Bahrain",
          "description": "Landforms, climate zones, and regions of Bahrain — including the 33-island archipelago, the King Fahd Causeway link to Saudi Arabia, the Jebel ad Dukhan high point, the lone mesquite 'Tree of Life' in the desert, the freshwater artesian springs that named the country ('two seas') and sustained ancient Dilmun, and the burial-mound fields among the densest on Earth."
        }
      ]
    },
    {
      "name": "Kuwait",
      "blurb": "The geography of Kuwait — the bay at the head of the Gulf.",
      "lessons": [
        {
          "title": "Cities & Settlements of Kuwait",
          "description": "The major cities and urban centers of Kuwait — their location, history, and regional role: Kuwait City (the Kuwait Towers and Souq Mubarakiya), Hawalli, the seaside district of Salmiya, Jahra, the oil-company town of Ahmadi, and Failaka Island (Hellenistic Ikaros) in the bay."
        },
        {
          "title": "Physical Geography & Regions of Kuwait",
          "description": "Landforms, climate zones, and regions of Kuwait — including Kuwait Bay and its natural harbor, the flat desert plain rising gently inland, the Mutla Ridge, the Wadi al-Batin along the western border, the large low islands of Bubiyan and Warbah, and the Burgan field, one of the largest oil fields ever found."
        }
      ]
    },

    // ================= Central Asia =================
    {
      "name": "Kazakhstan",
      "blurb": "The geography of Kazakhstan — the steppe giant between the Caspian and the Tian Shan.",
      "lessons": [
        {
          "title": "Cities & Settlements of Kazakhstan",
          "description": "The major cities and urban centers of Kazakhstan — their location, history, and regional role: Astana (the planned capital on the Ishim, one of the coldest capitals), Almaty beneath the Trans-Ili Alatau (and the genetic homeland of the apple), Shymkent, the coal capital Karaganda, the Caspian port of Aktau, the shrine city of Turkistan, and Baikonur, the leased cosmodrome town."
        },
        {
          "title": "Physical Geography & Regions of Kazakhstan",
          "description": "Landforms, rivers, climate zones, and regions of Kazakhstan — including the world's largest landlocked country, the vast Kazakh Steppe, the Caspian shore and the Aral Sea disaster (and the Kokaral Dam recovery of the North Aral), Lake Balkhash (half fresh, half saline), the Charyn Canyon, the Betpak-Dala desert, the Altai in the east, and Khan Tengri on the Tian Shan border."
        }
      ]
    },
    {
      "name": "Uzbekistan",
      "blurb": "The geography of Uzbekistan — the Silk Road heartland of Samarkand and Bukhara.",
      "lessons": [
        {
          "title": "Cities & Settlements of Uzbekistan",
          "description": "The major cities and urban centers of Uzbekistan — their location, history, and regional role: Tashkent (the largest city of Central Asia), Samarkand and the Registan, holy Bukhara, the walled museum city of Khiva (Itchan Kala), Nukus (capital of Karakalpakstan and the Savitsky art hoard), the Fergana Valley cities of Fergana, Andijan and Namangan, and Termez on the Amu Darya."
        },
        {
          "title": "Physical Geography & Regions of Uzbekistan",
          "description": "Landforms, rivers, climate zones, and regions of Uzbekistan — including one of the world's only two doubly landlocked countries, the Kyzylkum desert, the Amu Darya and Syr Darya rivers, the fertile Fergana Valley, the dried southern Aral Sea with the Moynaq ship graveyard and the new Aralkum desert, and the Ustyurt Plateau."
        }
      ]
    },
    {
      "name": "Turkmenistan",
      "blurb": "The geography of Turkmenistan — the Karakum and the Gates of Hell.",
      "lessons": [
        {
          "title": "Cities & Settlements of Turkmenistan",
          "description": "The major cities and urban centers of Turkmenistan — their location, history, and regional role: Ashgabat (the white-marble capital rebuilt after the 1948 earthquake), Turkmenabat on the Amu Darya, Dashoguz, Mary beside the ruins of ancient Merv, the Caspian port of Turkmenbashi, and Balkanabat."
        },
        {
          "title": "Physical Geography & Regions of Turkmenistan",
          "description": "Landforms, rivers, climate zones, and regions of Turkmenistan — including the Karakum Desert covering most of the country, the Karakum Canal (one of the longest irrigation canals ever built), the Darvaza gas crater ('the Gates of Hell'), the Kopet Dag range on the Iranian border, the Yangykala canyons, the Kow Ata underground lake, and the Amu Darya lifeline."
        }
      ]
    },
    {
      "name": "Kyrgyzstan",
      "blurb": "The geography of Kyrgyzstan — the Tian Shan and the warm lake Issyk-Kul.",
      "lessons": [
        {
          "title": "Cities & Settlements of Kyrgyzstan",
          "description": "The major cities and urban centers of Kyrgyzstan — their location, history, and regional role: Bishkek in the Chüy Valley, Osh beneath the UNESCO-listed Sulayman Mountain, Jalal-Abad, Karakol near the eastern end of Issyk-Kul, and the high mountain hub of Naryn."
        },
        {
          "title": "Physical Geography & Regions of Kyrgyzstan",
          "description": "Landforms, lakes, climate zones, and regions of Kyrgyzstan — including the Tian Shan with Jengish Chokusu (Pobeda Peak) and marble-pyramid Khan Tengri, Issyk-Kul (one of the largest alpine lakes on Earth, which never freezes), the alpine pasture lake Song-Kul, the Enylchek Glacier, the walnut forests of Arslanbob, and the rim of the Fergana Valley."
        }
      ]
    },
    {
      "name": "Tajikistan",
      "blurb": "The geography of Tajikistan — the Pamirs, the Roof of the World.",
      "lessons": [
        {
          "title": "Cities & Settlements of Tajikistan",
          "description": "The major cities and urban centers of Tajikistan — their location, history, and regional role: Dushanbe ('Monday', named for its market day), Khujand (Alexandria Eschate, 'the Furthest') in the Fergana mouth, Kulob, Khorog on the Pamir Highway in Gorno-Badakhshan, Istaravshan, and ancient Panjakent."
        },
        {
          "title": "Physical Geography & Regions of Tajikistan",
          "description": "Landforms, rivers, climate zones, and regions of Tajikistan — including the Pamirs ('the Roof of the World') and Ismoil Somoni Peak (the highest of the former USSR), the Fedchenko Glacier (the longest glacier outside the polar regions), Sarez Lake behind the natural Usoi landslide dam, Lake Karakul in a meteor crater, the Wakhan Corridor border with Afghanistan, the Panj and Vakhsh headwaters of the Amu Darya, and the Nurek Dam, among the tallest on Earth."
        }
      ]
    },

    // ================= South Asia =================
    {
      "name": "Afghanistan",
      "blurb": "The geography of Afghanistan — the Hindu Kush crossroads of empires.",
      "lessons": [
        {
          "title": "Cities & Settlements of Afghanistan",
          "description": "The major cities and urban centers of Afghanistan — their location, history, and regional role: Kabul (the high capital at 1,790 meters), Kandahar in the Pashtun south, Herat (the Persian gateway of the west), Mazar-i-Sharif and the Blue Mosque, Jalalabad on the road to the Khyber, and Bamyan with its empty Buddha niches and the Band-e Amir lakes."
        },
        {
          "title": "Physical Geography & Regions of Afghanistan",
          "description": "Landforms, rivers, climate zones, and regions of Afghanistan — including the Hindu Kush and Noshaq (the highest point), the Wakhan Corridor panhandle reaching China, the Salang Pass and tunnel, the Panjshir Valley, the Helmand River draining to the endorheic Sistan basin, the Registan and Dasht-e Margo deserts, the Amu Darya northern border, and the lapis lazuli mines of Badakhshan."
        }
      ]
    },
    {
      "name": "Pakistan",
      "blurb": "The geography of Pakistan — the Indus corridor beneath the Karakoram.",
      "lessons": [
        {
          "title": "Cities & Settlements of Pakistan",
          "description": "The major cities and urban centers of Pakistan — their location, history, and regional role: Islamabad (the planned capital beneath the Margalla Hills) and its twin Rawalpindi, the port megacity of Karachi, Mughal Lahore, industrial Faisalabad, Peshawar at the mouth of the Khyber Pass, Multan ('the City of Saints'), Quetta in Balochistan, and the northern gateways of Gilgit and Skardu."
        },
        {
          "title": "Physical Geography & Regions of Pakistan",
          "description": "Landforms, rivers, climate zones, and regions of Pakistan — including K2 (the second-highest mountain on Earth) and the Karakoram, the meeting point of the Karakoram, Hindu Kush and Himalaya near Gilgit, the Indus River and the five rivers of the Punjab, the Thar Desert, the Balochistan Plateau and the Makran coast with its mud volcanoes, the Khyber and Bolan passes, the high Deosai Plains, and the great Tarbela Dam."
        }
      ]
    },
    {
      "name": "India",
      "blurb": "The geography of India — the subcontinent from the Himalaya to the Ghats.",
      "lessons": [
        {
          "title": "Cities & Settlements of India",
          "description": "The major cities and urban centers of India — their location, history, and regional role: Delhi and New Delhi, Mumbai, Kolkata on the Hooghly, Chennai, Bengaluru (the Deccan tech capital), Hyderabad, Varanasi (among the oldest living cities, on the Ganges), Jaipur ('the Pink City'), Ahmedabad, and Kochi on the Malabar coast."
        },
        {
          "title": "States & Regions of India",
          "description": "The states and union territories of India — from Rajasthan, Gujarat and Punjab to Uttar Pradesh (the most populous subnational entity on Earth), Bengal, the seven-sister states of the Northeast, the Deccan states of Maharashtra, Karnataka, Telangana and Andhra Pradesh, and Kerala and Tamil Nadu in the south — each with its capital, landscape, and role."
        },
        {
          "title": "Physical Geography & Regions of India",
          "description": "Landforms, rivers, climate zones, and regions of India — including the Himalayan wall and Kangchenjunga (the highest point), the Indo-Gangetic Plain, the Thar Desert, the Deccan Plateau flanked by the Western and Eastern Ghats, the Ganges and Brahmaputra river systems and the Sundarbans delta, the monsoon engine and the wettest places on Earth (Mawsynram and Cherrapunji), and the island territories of the Andamans, Nicobars, and Lakshadweep."
        }
      ]
    },
    {
      "name": "Nepal",
      "blurb": "The geography of Nepal — eight of the fourteen eight-thousanders.",
      "lessons": [
        {
          "title": "Cities & Settlements of Nepal",
          "description": "The major cities and urban centers of Nepal — their location, history, and regional role: Kathmandu and the valley's royal cities of Lalitpur (Patan) and Bhaktapur with their Durbar squares, lakeside Pokhara beneath the Annapurnas, Biratnagar in the Terai, Lumbini (the birthplace of the Buddha), and the Sherpa hub of Namche Bazaar."
        },
        {
          "title": "Physical Geography & Regions of Nepal",
          "description": "Landforms, rivers, climate zones, and regions of Nepal — including Mount Everest (Sagarmatha) and eight of the world's fourteen 8,000-meter peaks, the three east-west belts of Terai plain, Middle Hills (Pahad) and High Himalaya, the Kali Gandaki gorge between Dhaulagiri and Annapurna (among the deepest on Earth), the Koshi, Gandaki and Karnali river systems, and remote Rara Lake."
        }
      ]
    },
    {
      "name": "Bhutan",
      "blurb": "The geography of Bhutan — the carbon-negative dragon kingdom.",
      "lessons": [
        {
          "title": "Cities & Settlements of Bhutan",
          "description": "The major cities and urban centers of Bhutan — their location, history, and regional role: Thimphu (a capital famous for having no traffic lights), Paro with the international airport and the Tiger's Nest monastery (Paro Taktsang), Punakha (the former capital with its dzong at a river confluence), the border trade town of Phuntsholing, and Jakar in the Bumthang valleys."
        },
        {
          "title": "Physical Geography & Regions of Bhutan",
          "description": "Landforms, rivers, climate zones, and regions of Bhutan — including Gangkhar Puensum (the highest unclimbed mountain in the world), the ladder of north-south river valleys descending from the high Himalaya to the Duars plain, the Dochula pass, the country's constitutional forest protections that keep it carbon-negative, and Gross National Happiness as national policy."
        }
      ]
    },
    {
      "name": "Bangladesh",
      "blurb": "The geography of Bangladesh — the great delta of the Ganges and Brahmaputra.",
      "lessons": [
        {
          "title": "Cities & Settlements of Bangladesh",
          "description": "The major cities and urban centers of Bangladesh — their location, history, and regional role: Dhaka on the Buriganga (one of the densest megacities), the port of Chittagong (Chattogram), Khulna (gateway to the Sundarbans), Sylhet among the tea gardens and wetlands, Rajshahi, and Cox's Bazar with its immense natural sea beach."
        },
        {
          "title": "Physical Geography & Regions of Bangladesh",
          "description": "Landforms, rivers, climate zones, and regions of Bangladesh — including the Ganges-Brahmaputra-Meghna delta (the largest river delta on Earth), the Sundarbans mangrove forest of the Bengal tiger, the shifting char islands, cyclone and flood exposure on the Bay of Bengal, the Chittagong Hill Tracts in the southeast, the haor wetland basins of Sylhet, and the jute and rice economy of the floodplain."
        }
      ]
    },
    {
      "name": "Sri Lanka",
      "blurb": "The geography of Sri Lanka — the teardrop island of highlands and ancient capitals.",
      "lessons": [
        {
          "title": "Cities & Settlements of Sri Lanka",
          "description": "The major cities and urban centers of Sri Lanka — their location, history, and regional role: Colombo (the commercial capital) and Sri Jayawardenepura Kotte (the legislative capital), Kandy and the Temple of the Tooth, the Dutch fort city of Galle, Jaffna in the Tamil north, Trincomalee and its great natural harbor, the tea town of Nuwara Eliya, and the ancient cultural-triangle capitals of Anuradhapura, Polonnaruwa and the rock fortress of Sigiriya."
        },
        {
          "title": "Physical Geography & Regions of Sri Lanka",
          "description": "Landforms, rivers, climate zones, and regions of Sri Lanka — including the Central Highlands with Pidurutalagala and the pilgrimage peak of Adam's Peak (Sri Pada), the Mahaweli (the longest river), the wet-zone southwest versus the dry-zone north and east, Adam's Bridge (Rama Setu) across the Palk Strait toward India, and the leopard country of Yala."
        }
      ]
    },
    {
      "name": "Maldives",
      "blurb": "The geography of the Maldives — the lowest country on Earth.",
      "lessons": [
        {
          "title": "Cities & Settlements of the Maldives",
          "description": "The settlements of the Maldives — Malé (one of the most densely populated islands in the world), the reclaimed new town of Hulhumalé, Addu City on the southern Gan atoll, and Fuvahmulah, the lone one-island atoll."
        },
        {
          "title": "Physical Geography & Regions of the Maldives",
          "description": "Atolls, reefs, and climate of the Maldives — including the chain of 26 natural atolls and roughly 1,190 coral islands strung along the Chagos-Laccadive Ridge, the lowest and flattest country on Earth (averaging about 1.5 meters above sea level), the Equatorial Channel, the word 'atoll' itself as a loan from Dhivehi, and sea-level rise as an existential national issue."
        }
      ]
    },

    // ================= East Asia =================
    {
      "name": "China",
      "blurb": "The geography of China — three topographic steps from Tibet to the sea.",
      "lessons": [
        {
          "title": "Cities & Settlements of China",
          "description": "The major cities and urban centers of China — their location, history, and regional role: Beijing, Shanghai at the Yangtze mouth, Guangzhou and Shenzhen in the Pearl River Delta, the mountain municipality of Chongqing, Chengdu in the Sichuan Basin, the old capital Xi'an, Wuhan at the Yangtze-Han confluence, Hangzhou, ice-festival Harbin, Lhasa on the Tibetan Plateau, Ürümqi (the large city farthest from any ocean), and the special administrative regions of Hong Kong and Macau."
        },
        {
          "title": "Provinces & Regions of China",
          "description": "The provinces and regions of China — the 23 provinces, 5 autonomous regions (Tibet, Xinjiang, Inner Mongolia, Guangxi, Ningxia), 4 direct-administered municipalities (Beijing, Shanghai, Tianjin, Chongqing), and 2 special administrative regions — each with its capital, landscape, and economic role, from Heilongjiang's black earth to Hainan's tropics."
        },
        {
          "title": "Physical Geography & Regions of China",
          "description": "Landforms, rivers, climate zones, and regions of China — including the three-step staircase from the Tibetan Plateau ('the Roof of the World') down to the eastern plains, the Himalaya, Kunlun and Tian Shan ranges, the Taklamakan and Gobi deserts and the Turpan Depression (one of the lowest land points), the Yangtze (Asia's longest river) and the Three Gorges Dam, the loess-laden Yellow River cradle of Chinese civilization, the Pearl River, and the karst tower landscapes of Guilin and Guangxi."
        }
      ]
    },
    {
      "name": "Mongolia",
      "blurb": "The geography of Mongolia — steppe, Gobi, and the coldest capital.",
      "lessons": [
        {
          "title": "Cities & Settlements of Mongolia",
          "description": "The major cities and urban centers of Mongolia — their location, history, and regional role: Ulaanbaatar (the coldest national capital on Earth, holding nearly half the population), the copper city of Erdenet, Darkhan, Kharkhorin beside the ruins of Karakorum (Genghis Khan's imperial capital), and Ölgii, the far-western hub of Kazakh eagle hunters."
        },
        {
          "title": "Physical Geography & Regions of Mongolia",
          "description": "Landforms, climate zones, and regions of Mongolia — including the Gobi Desert, the vast grass steppe of the least densely populated sovereign country, the Mongolian Altai and Khüiten Peak at Tavan Bogd, the Khangai and Khentii ranges (with sacred Burkhan Khaldun), Lake Khövsgöl ('the Dark Blue Pearl', holding most of the nation's fresh water), the Orkhon Valley, the killer zud winters, and the wildlife of Bactrian camels and Przewalski's horses."
        }
      ]
    },
    {
      "name": "North Korea",
      "blurb": "The geography of North Korea — the mountainous north of the peninsula.",
      "lessons": [
        {
          "title": "Cities & Settlements of North Korea",
          "description": "The major cities and urban centers of North Korea — their location, history, and regional role: Pyongyang on the Taedong (the Juche Tower and the Ryugyong pyramid), the industrial east-coast cities of Hamhung, Chongjin and Wonsan, Sinuiju on the Yalu opposite China, Kaesong (the old Koryo capital near the DMZ), and the Rason special economic zone."
        },
        {
          "title": "Physical Geography & Regions of North Korea",
          "description": "Landforms, rivers, climate zones, and regions of North Korea — including Mount Paektu (the sacred volcanic peak of the peninsula, with the crater Lake Chon), the Yalu and Tumen border rivers, the rugged Hamgyong and Nangnim ranges that leave farming to the western plains, the Taedong through Pyongyang, and the Demilitarized Zone along the armistice line."
        }
      ]
    },
    {
      "name": "South Korea",
      "blurb": "The geography of South Korea — the Taebaek spine and volcanic Jeju.",
      "lessons": [
        {
          "title": "Cities & Settlements of South Korea",
          "description": "The major cities and urban centers of South Korea — their location, history, and regional role: Seoul astride the Han River, the port metropolis of Busan, Incheon (the airport hub on reclaimed tidal flats), Daegu, Daejeon, Gwangju, the planned administrative city of Sejong, and Jeonju of the hanok village."
        },
        {
          "title": "Physical Geography & Regions of South Korea",
          "description": "Landforms, rivers, climate zones, and regions of South Korea — including the Taebaek range running down the east coast (Seoraksan), the Han and Nakdong river basins, the extreme tidal range of the west coast and the Jindo 'sea parting', volcanic Jeju Island with Hallasan (the highest point) and its haenyeo free divers, and the DMZ across the peninsula's waist."
        }
      ]
    },
    {
      "name": "Japan",
      "blurb": "The geography of Japan — the volcanic arc of four great islands.",
      "lessons": [
        {
          "title": "Cities & Settlements of Japan",
          "description": "The major cities and urban centers of Japan — their location, history, and regional role: Tokyo (the largest metropolitan area on Earth) and Yokohama, the Kansai triangle of Osaka, Kyoto and Kobe, Nagoya, Sapporo on Hokkaido, Fukuoka on Kyushu, Hiroshima and Nagasaki, Sendai, and Naha in Okinawa."
        },
        {
          "title": "Islands & Regions of Japan",
          "description": "The islands and regions of Japan — the four main islands of Honshu, Hokkaido, Kyushu and Shikoku plus the Ryukyu chain to Okinawa, and the eight traditional regions from Tohoku to Kyushu, with the 47 prefectures and how the Seto Inland Sea binds the three southern islands together."
        },
        {
          "title": "Physical Geography & Regions of Japan",
          "description": "Landforms, rivers, climate zones, and regions of Japan — including the Pacific Ring of Fire and Mount Fuji, the Japanese Alps, the Japan Trench and the 2011 Tohoku earthquake and tsunami, the Kuroshio and Oyashio currents, the sea-effect 'snow country' of the Sea of Japan coast (Aomori among the snowiest cities on Earth), the Shinano (the longest river), ancient Lake Biwa, and the typhoon season."
        }
      ]
    },
    {
      "name": "Taiwan",
      "blurb": "The geography of Taiwan — the marble gorges and the highest peak of the island east.",
      "lessons": [
        {
          "title": "Cities & Settlements of Taiwan",
          "description": "The major cities and urban centers of Taiwan — their location, history, and regional role: Taipei in its river basin (with Taipei 101) and New Taipei around it, the southern port of Kaohsiung, Taichung, Tainan (the oldest city), the semiconductor hub of Hsinchu, and the east-coast towns of Hualien and Taitung."
        },
        {
          "title": "Physical Geography & Regions of Taiwan",
          "description": "Landforms, rivers, climate zones, and regions of Taiwan — including the Central Mountain Range and Yu Shan (Jade Mountain, taller than Mount Fuji), the marble-walled Taroko Gorge, the fertile western plains facing the Taiwan Strait, Sun Moon Lake, the outlying islands of Penghu, Kinmen and Matsu, the Tropic of Cancer crossing, and the constant company of earthquakes and typhoons."
        }
      ]
    },

    // ================= Southeast Asia =================
    {
      "name": "Myanmar",
      "blurb": "The geography of Myanmar — the Irrawaddy corridor from Himalaya to delta.",
      "lessons": [
        {
          "title": "Cities & Settlements of Myanmar",
          "description": "The major cities and urban centers of Myanmar — their location, history, and regional role: Naypyidaw (the vast, purpose-built capital), Yangon and the Shwedagon Pagoda, Mandalay (the last royal capital), the temple plain of Bagan, Mawlamyine, and Taunggyi above Inle Lake."
        },
        {
          "title": "Physical Geography & Regions of Myanmar",
          "description": "Landforms, rivers, climate zones, and regions of Myanmar — including the Irrawaddy (Ayeyarwady) river spine and its delta, Hkakabo Razi (the highest peak in Southeast Asia) in the far north, the Shan Plateau, the Rakhine (Arakan) coastal range, the Salween and Chindwin rivers, Inle Lake with its leg-rowing fishermen, and the Mergui Archipelago on the Andaman Sea."
        }
      ]
    },
    {
      "name": "Thailand",
      "blurb": "The geography of Thailand — the Chao Phraya rice bowl and the Kra Isthmus.",
      "lessons": [
        {
          "title": "Cities & Settlements of Thailand",
          "description": "The major cities and urban centers of Thailand — their location, history, and regional role: Bangkok (Krung Thep, holder of the longest official city name) on the Chao Phraya, Chiang Mai (the Lanna capital of the north), the Isan hubs of Khon Kaen and Udon Thani, the old royal capitals of Ayutthaya and Sukhothai, the island city of Phuket, and Hat Yai near the Malaysian border."
        },
        {
          "title": "Physical Geography & Regions of Thailand",
          "description": "Landforms, rivers, climate zones, and regions of Thailand — including the Chao Phraya central plain ('the rice bowl'), the Khorat Plateau of Isan draining via the Mun to the Mekong, Doi Inthanon (the highest point) in the northern ranges, the narrow Kra Isthmus, the drowned karst towers of Phang Nga Bay on the Andaman coast, and the Gulf of Thailand."
        }
      ]
    },
    {
      "name": "Laos",
      "blurb": "The geography of Laos — the landlocked Mekong kingdom.",
      "lessons": [
        {
          "title": "Cities & Settlements of Laos",
          "description": "The major cities and urban centers of Laos — their location, history, and regional role: Vientiane on the Mekong bend, the UNESCO royal city of Luang Prabang, Pakse (gateway to the Bolaven Plateau and the far south), Savannakhet, Phonsavan beside the Plain of Jars, and the karst resort town of Vang Vieng."
        },
        {
          "title": "Physical Geography & Regions of Laos",
          "description": "Landforms, rivers, climate zones, and regions of Laos — including Southeast Asia's only landlocked country ('land-linked' along the Mekong), the Si Phan Don (Four Thousand Islands) and Khone Falls that block navigation to the sea, the Annamite Range along the Vietnamese border, Phou Bia (the highest point), the coffee-growing Bolaven Plateau, and the hydropower dams that brand Laos 'the battery of Southeast Asia'."
        }
      ]
    },
    {
      "name": "Cambodia",
      "blurb": "The geography of Cambodia — Angkor and the reversing Tonlé Sap.",
      "lessons": [
        {
          "title": "Cities & Settlements of Cambodia",
          "description": "The major cities and urban centers of Cambodia — their location, history, and regional role: Phnom Penh at the Chaktomuk ('four faces') confluence of the Mekong, Tonlé Sap and Bassac rivers, Siem Reap beside the temples of Angkor, Battambang, the deep-water port of Sihanoukville, and the pepper coast towns of Kampot and Kep."
        },
        {
          "title": "Physical Geography & Regions of Cambodia",
          "description": "Landforms, rivers, climate zones, and regions of Cambodia — including the Tonlé Sap (the largest lake in Southeast Asia, whose feeder river famously reverses direction with the monsoon), the Mekong corridor, the Cardamom Mountains and Phnom Aural (the highest point), the Dangrek escarpment along the Thai border with the Preah Vihear temple, and the great central rice floodplain."
        }
      ]
    },
    {
      "name": "Vietnam",
      "blurb": "The geography of Vietnam — two rice baskets on a carrying pole.",
      "lessons": [
        {
          "title": "Cities & Settlements of Vietnam",
          "description": "The major cities and urban centers of Vietnam — their location, history, and regional role: Hanoi and its Old Quarter on the Red River, Ho Chi Minh City (Saigon), Da Nang, the imperial citadel city of Hue on the Perfume River, the port of Haiphong, Can Tho (the Mekong Delta hub), the hill station of Da Lat, and the old trading town of Hoi An."
        },
        {
          "title": "Physical Geography & Regions of Vietnam",
          "description": "Landforms, rivers, climate zones, and regions of Vietnam — including the two great deltas (the Red River in the north and the Mekong in the south) joined by the narrow Annamite coastal strip ('two rice baskets on a carrying pole'), Fansipan ('the Roof of Indochina'), the drowned karst of Ha Long Bay, Son Doong (the largest known cave passage on Earth), the basalt Central Highlands, and the typhoon coast."
        }
      ]
    },
    {
      "name": "Malaysia",
      "blurb": "The geography of Malaysia — a country in two halves across the South China Sea.",
      "lessons": [
        {
          "title": "Cities & Settlements of Malaysia",
          "description": "The major cities and urban centers of Malaysia — their location, history, and regional role: Kuala Lumpur (the Petronas Towers) and the planned administrative capital Putrajaya, George Town on Penang, Ipoh, Johor Bahru facing Singapore, the historic straits port of Malacca (Melaka), and the East Malaysian capitals of Kota Kinabalu (Sabah) and Kuching (Sarawak)."
        },
        {
          "title": "Physical Geography & Regions of Malaysia",
          "description": "Landforms, rivers, climate zones, and regions of Malaysia — including the two halves separated by the South China Sea, the Titiwangsa range and Cameron Highlands of the peninsula, Taman Negara (among the oldest rainforests on Earth), Mount Kinabalu in Sabah (the highest peak between the Himalaya and New Guinea), the Mulu caves with the gigantic Sarawak Chamber, the Rajang (the longest river), and the Strait of Malacca chokepoint."
        }
      ]
    },
    {
      "name": "Singapore",
      "blurb": "The geography of Singapore — the engineered island city-state on the strait.",
      "lessons": [
        {
          "title": "Districts & Planning of Singapore",
          "description": "The urban geography of Singapore — the Downtown Core and Marina Bay, the industrial west of Jurong, Changi in the east, the HDB new towns such as Tampines, Toa Payoh and Woodlands, and Sentosa — and how a city-state master-plans every hectare."
        },
        {
          "title": "Physical Geography & Strategic Straits of Singapore",
          "description": "Landforms, reclamation, and strategic position of Singapore — including the main island and some 60 islets, the granite high point of Bukit Timah, the roughly one-quarter of national territory created by land reclamation, the last patch of primary rainforest at Bukit Timah and the MacRitchie reservoirs, the Johor causeway and Tuas link to Malaysia, and the Singapore Strait, one of the busiest shipping lanes on Earth."
        }
      ]
    },
    {
      "name": "Brunei",
      "blurb": "The geography of Brunei — the sultanate in two lobes on Borneo's coast.",
      "lessons": [
        {
          "title": "Cities & Settlements of Brunei",
          "description": "The major cities and urban centers of Brunei — their location, history, and regional role: Bandar Seri Begawan and the stilt water village of Kampong Ayer (among the largest in the world), the oil towns of Seria and Kuala Belait, Tutong, and Bangar in the detached Temburong district."
        },
        {
          "title": "Physical Geography & Regions of Brunei",
          "description": "Landforms, climate zones, and regions of Brunei — including the two lobes split by Malaysia's Limbang corridor, the pristine Ulu Temburong rainforest, Bukit Pagon (the highest point), Brunei Bay, and the offshore hydrocarbons that made the sultanate wealthy."
        }
      ]
    },
    {
      "name": "Indonesia",
      "blurb": "The geography of Indonesia — the largest archipelago on Earth.",
      "lessons": [
        {
          "title": "Cities & Settlements of Indonesia",
          "description": "The major cities and urban centers of Indonesia — their location, history, and regional role: Jakarta (the sinking megacity) and Nusantara (the new capital rising in East Kalimantan), Surabaya, Bandung, Medan on Sumatra, Makassar on Sulawesi, Semarang, the sultanate city of Yogyakarta near Borobudur and Prambanan, Denpasar on Bali, and Jayapura in Papua."
        },
        {
          "title": "Islands & Regions of Indonesia",
          "description": "The islands and regions of Indonesia — Sumatra, Java (the most populous island on Earth), Kalimantan (the Indonesian share of Borneo), Sulawesi and its four arms, the Lesser Sunda chain from Bali to Timor, the Maluku spice islands, and the western half of New Guinea — roughly 17,000 islands in all."
        },
        {
          "title": "Physical Geography & Regions of Indonesia",
          "description": "Landforms, volcanoes, climate zones, and regions of Indonesia — including the Ring of Fire arc with Krakatoa, Tambora (the largest eruption in recorded history) and the Toba supervolcano with the largest volcanic lake on Earth, Puncak Jaya (the highest island peak on Earth, with equatorial glaciers), the Wallace Line dividing Asian from Australasian wildlife, the Komodo dragons, the peat and rainforest of Borneo and Sumatra, and the straits of Malacca, Sunda and Lombok."
        }
      ]
    },
    {
      "name": "Philippines",
      "blurb": "The geography of the Philippines — 7,641 islands on the typhoon belt.",
      "lessons": [
        {
          "title": "Cities & Settlements of the Philippines",
          "description": "The major cities and urban centers of the Philippines — their location, history, and regional role: Manila and Quezon City in Metro Manila, Cebu City (the oldest Spanish settlement), Davao on Mindanao, Iloilo, Zamboanga, the pine-forest 'summer capital' of Baguio, and the preserved colonial town of Vigan."
        },
        {
          "title": "Island Groups of the Philippines",
          "description": "The three island groups of the Philippines — Luzon in the north, the Visayas in the center (Cebu, Negros, Panay, Leyte, Samar, Bohol), and Mindanao in the south, plus Palawan stretching toward Borneo — and how the archipelago's roughly 7,641 islands are organized into regions and provinces."
        },
        {
          "title": "Physical Geography & Regions of the Philippines",
          "description": "Landforms, volcanoes, climate zones, and regions of the Philippines — including Mount Apo (the highest peak), the perfect cone of Mayon, the 1991 Pinatubo eruption, Taal and its island-in-a-lake-in-an-island recursion, the Philippine Trench (among the deepest points of the ocean), the world's most typhoon-exposed coastline, the Banaue rice terraces, the Chocolate Hills of Bohol, and the Puerto Princesa underground river."
        }
      ]
    },
    {
      "name": "Timor-Leste",
      "blurb": "The geography of Timor-Leste — Asia's newest nation on half an island.",
      "lessons": [
        {
          "title": "Cities & Settlements of Timor-Leste",
          "description": "The major cities and urban centers of Timor-Leste — their location, history, and regional role: Dili (the seaside capital), Baucau, Maliana, Suai on the south coast, Pante Macassar in the Oecusse exclave inside Indonesian West Timor, and the island of Atauro across the strait from Dili."
        },
        {
          "title": "Physical Geography & Regions of Timor-Leste",
          "description": "Landforms, climate zones, and regions of Timor-Leste — including the eastern half of Timor plus the Oecusse exclave, the central mountain spine and Tatamailau (Mount Ramelau, the highest point), the deep Wetar Strait offshore, the coffee highlands of Ermera, the Timor Gap petroleum fields, and its status as Asia's newest sovereign state (2002)."
        }
      ]
    }
  ];

const FINAL_EXAM_UNIT = {
  title: 'Final Exam - Comprehensive Asian Geography',
  description: 'Cumulative final exam across all 45 countries: cities, physical geography, regions, islands, rivers, deserts and straits of the entire continent, organized by region.',
  textbookContext: "ASIA — CONTINENTAL SYNTHESIS (cumulative final-exam scope)\n\nThis exam is cumulative across every country in the course. (The Caucasus and Turkey are covered in the Europe Geography course.) Review by region:\n\n- The Levant & Eastern Mediterranean: Cyprus, Syria, Lebanon, Israel, Palestine, Jordan. The Troodos ophiolite and the divided capital Nicosia; the Orontes and the Euphrates with Lake Assad; Mount Lebanon (Qurnat as Sawda') and the Beqaa; the Jordan Rift, the Dead Sea (lowest land on Earth), the Sea of Galilee and the Negev; Wadi Rum and Petra. Cities: Nicosia, Damascus, Aleppo, Beirut, Tripoli, Jerusalem, Tel Aviv, Haifa, Ramallah, Gaza City, Jericho, Amman, Aqaba.\n- Mesopotamia & the Iranian Plateau: Iraq, Iran. The Tigris-Euphrates system, the Shatt al-Arab, the Marshes, the Zagros of Kurdistan; the Alborz and Damavand (highest volcano in Asia), the Zagros folds, Dasht-e Kavir and Dasht-e Lut (hottest recorded land surface), Lake Urmia, the qanats and the Strait of Hormuz. Cities: Baghdad, Basra, Mosul, Erbil, Najaf, Karbala, Tehran, Mashhad, Isfahan, Shiraz, Tabriz, Bandar Abbas, Yazd.\n- The Arabian Peninsula: Saudi Arabia, Yemen, Oman, UAE, Qatar, Bahrain, Kuwait. The Rub' al Khali, An Nafud and Ad Dahna; the Hejaz and Asir; Jabal an-Nabi Shu'ayb (highest of the peninsula) and Socotra; the Hajar range, the Musandam fjords and the khareef of Dhofar; the seven emirates and the Liwa Oasis; the North Field gas; Dilmun's springs; Kuwait Bay and Burgan. Cities: Riyadh, Jeddah, Mecca, Medina, Sana'a, Aden, Shibam, Muscat, Salalah, Nizwa, Abu Dhabi, Dubai, Al Ain, Doha, Manama, Kuwait City.\n- Central Asia: Kazakhstan, Uzbekistan, Turkmenistan, Kyrgyzstan, Tajikistan. The Kazakh Steppe, Lake Balkhash (half fresh, half saline), the Aral Sea disaster and the Kokaral Dam; the Silk Road cities and the doubly landlocked anomaly; the Karakum, the Karakum Canal and the Darvaza crater; the Tian Shan (Jengish Chokusu, Khan Tengri) and Issyk-Kul; the Pamirs (Ismoil Somoni), the Fedchenko Glacier, Sarez Lake and the Wakhan. Rivers: Amu Darya and Syr Darya. Cities: Astana, Almaty, Tashkent, Samarkand, Bukhara, Khiva, Ashgabat, Merv/Mary, Bishkek, Osh, Dushanbe, Khujand, Khorog.\n- South Asia: Afghanistan, Pakistan, India, Nepal, Bhutan, Bangladesh, Sri Lanka, Maldives. The Hindu Kush (Noshaq) and the Wakhan; K2 and the Karakoram-Hindu Kush-Himalaya junction, the Indus and the five rivers of Punjab, the Khyber and Bolan passes; the Himalaya (Kangchenjunga in India, Everest in Nepal, unclimbed Gangkhar Puensum in Bhutan), the Indo-Gangetic Plain, the Thar, the Deccan between the Western and Eastern Ghats, the monsoon and Mawsynram/Cherrapunji; the Ganges-Brahmaputra-Meghna delta (largest on Earth) and the Sundarbans; Adam's Peak and the Palk Strait; the atolls of the lowest country on Earth. Cities: Kabul, Kandahar, Herat, Islamabad, Karachi, Lahore, Peshawar, Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Varanasi, Kathmandu, Pokhara, Thimphu, Paro, Dhaka, Chittagong, Colombo, Kandy, Malé.\n- East Asia: China, Mongolia, North Korea, South Korea, Japan, Taiwan. The three-step staircase from the Tibetan Plateau, the Yangtze and Yellow rivers, the Three Gorges Dam, the Taklamakan, Gobi and Turpan Depression, the Guilin karst; the steppe and zud of Mongolia, Khövsgöl and the Altai; Mount Paektu and the Yalu-Tumen border; the Taebaek spine, the Han and Nakdong, volcanic Jeju and Hallasan; the Ring of Fire, Fuji, the Japan Trench and the 2011 tsunami, the Kuroshio, snow country, Lake Biwa; Yu Shan above Fuji's height, Taroko Gorge and the Taiwan Strait. Cities: Beijing, Shanghai, Guangzhou, Shenzhen, Chongqing, Chengdu, Xi'an, Lhasa, Ürümqi, Hong Kong, Ulaanbaatar, Pyongyang, Seoul, Busan, Incheon, Tokyo, Osaka, Kyoto, Sapporo, Taipei, Kaohsiung.\n- Southeast Asia: Myanmar, Thailand, Laos, Cambodia, Vietnam, Malaysia, Singapore, Brunei, Indonesia, Philippines, Timor-Leste. The Irrawaddy and Hkakabo Razi (highest of Southeast Asia); the Chao Phraya rice bowl, the Khorat Plateau and the Kra Isthmus; the landlocked Mekong kingdom, Khone Falls and Si Phan Don; the reversing Tonlé Sap and Angkor; the two deltas of Vietnam, Fansipan, Ha Long Bay and Son Doong (largest cave passage); Kinabalu, Mulu and the Strait of Malacca; the engineered island city-state; the two-lobed sultanate; the 17,000-island archipelago, Tambora, Toba, Krakatoa, Puncak Jaya and the Wallace Line; the 7,641 islands, Apo, Mayon, Pinatubo, Taal and the Philippine Trench; Ramelau and the Oecusse exclave. Cities: Naypyidaw, Yangon, Mandalay, Bangkok, Chiang Mai, Vientiane, Luang Prabang, Phnom Penh, Siem Reap, Hanoi, Ho Chi Minh City, Hue, Da Nang, Kuala Lumpur, George Town, Kota Kinabalu, Kuching, Singapore, Bandar Seri Begawan, Jakarta, Nusantara, Surabaya, Yogyakarta, Manila, Cebu, Davao, Dili.\n\nBe able to: locate each country and its capital; identify the major rivers, mountain systems, deserts, lakes, islands, seas and straits; match cities to countries and regions; and explain the regional divisions, tectonic features (the Ring of Fire, the Himalayan collision, the Arabian rift margins), monsoon systems, and competition-level details covered in the lessons.",
  lessons: [
    {
      title: 'Continental Review - Countries, Capitals & Regions',
      description: 'Synthesize the whole course region by region - the Levant and Eastern Mediterranean, Mesopotamia and the Iranian Plateau, the Arabian Peninsula, Central Asia, South Asia, East Asia, and Southeast Asia - matching each country to its capital, major cities, and regional grouping.',
    },
    {
      title: 'Continental Review - Mountains, Rivers, Deserts & Seas',
      description: "Cross-country physical geography: the Himalaya-Karakoram-Hindu Kush arc, the Tian Shan and Pamirs, the Zagros and Alborz; the Tigris-Euphrates, Indus, Ganges-Brahmaputra, Mekong, Yangtze and Yellow river systems; the Rub' al Khali, Gobi, Taklamakan, Karakum and Thar deserts; the great archipelagos and the Ring of Fire; and Asia's seas, straits and chokepoints from Hormuz and Bab-el-Mandeb to Malacca.",
    },
  ],
};

export const ASIA_GEOGRAPHY_COURSE = {
  slug: 'asia-geography',
  title: 'Asia Geography',
  description: 'A country-by-country tour of Asia, from the Levant to the Pacific archipelagos. All 45 countries beyond the Caucasus (covered in Europe Geography) get their own unit covering cities, physical geography, regions and islands, capped by a cumulative final exam over the whole continent.',
  subject: 'geography',
  grade: '9-12',
  difficulty: 'advanced',
  textbook: 'Competition-level Asia geography syllabus',
  units: [
    ...COUNTRIES.map((c) => ({
      title: c.name,
      description: c.blurb,
      textbookContext: null,
      lessons: c.lessons,
    })),
    FINAL_EXAM_UNIT,
  ],
};
