"use strict";
/**
 * Endpoints related to advertisements
 */
const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const { jwtAuth, jwtReturnUser } = require("../../lib/jwtAuth");
const { Advertisement, User } = require("../../models");
const storeFileSmallName = require("../../lib/storeFileSmallName");
const cote = require("cote");
const requester = new cote.Requester({ name: "image client" });
const pathImages = "/images/";
const {
  consts: { ERROR_CAUSE, ERROR_NOT_FOUND, ID },
} = require("../../utils");

/* GET /api/v1/adverts */
// List of ads
router.get("/", async function (req, res, next) {
  try {
    const { name, price, sale, tags, fields, sort } = req.query;
    const limit = parseInt(req.query.limit);
    const start = parseInt(req.query.start);
    const page = parseInt(req.query.page);
    const filtro = {};

    if (name) {
      filtro.name = new RegExp(name, "i");
    }

    if (price) {
      let pricesArray = [];
      if (Array.isArray(price)) {
        pricesArray = price;
      } else if (price.search("-") !== -1) {
        pricesArray = price.split("-");
      } else {
        filtro.price = price;
      }

      if (pricesArray[0] === "") {
        filtro.price = { $lte: pricesArray[1] };
      } else if (pricesArray[1] === "") {
        filtro.price = { $gte: pricesArray[0] };
      } else if (pricesArray[0] !== "" && pricesArray[1] !== "") {
        filtro.price = { $gte: pricesArray[0], $lte: pricesArray[1] };
      }
    }

    if (sale) {
      filtro.sale = sale;
    }

    if (tags) {
      filtro.tags = { $in: tags };
    }

    const result = await Advertisement.list(filtro, limit, page, fields, sort);
    res.status(200).json(
      result.map((elem) => {
        return {
          id: elem.id,
          createdAt: elem.createdAt.toString(),
          updatedAt: elem.updatedAt.toString(),
          name: elem.name,
          price: elem.price,
          description: elem.description,
          sale: elem.sale,
          tags: elem.tags,
          booked: elem.booked,
          sold: elem.sold,
          username: elem.username,
          photo: elem.photo ? pathImages + elem.photo : null,
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/adverts/tags
// Obtain tags
router.get("/tags", async (req, res, next) => {
  try {
    const result = await Advertisement.listTags();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/adverts/:id
// Obtain an ad
router.get("/:id", async (req, res, next) => {
  try {
    const _id = req.params.id;

    const ad = await Advertisement.findOne({
      [ID]: mongoose.Types.ObjectId(_id),
    });
    if (!ad) {
      return res.status(404).json({ [ERROR_CAUSE]: ERROR_NOT_FOUND });
    }
    res.status(200).json({
      id: ad.id,
      createdAt: ad.createdAt.toString(),
      updatedAt: ad.updatedAt.toString(),
      name: ad.name,
      price: ad.price,
      description: ad.description,
      sale: ad.sale,
      tags: ad.tags,
      username: ad.username,
      booked: ad.booked,
      sold: ad.sold,
      photo: ad.photo ? pathImages + ad.photo : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/adverts (body)
// Create an ad
router.post("/", jwtAuth, async (req, res, next) => {
  try {
    const adData = req.body;
    const userId = jwtReturnUser(req.headers.authorization);
    const user = await User.findOne({ [ID]: mongoose.Types.ObjectId(userId) });

    if (req.file) {
      // Send a message with fileName and full path.
      adData.photo = storeFileSmallName(req.file);
    }

    if (!user) {
      return res.status(400).json({
        [ERROR_CAUSE]: user
          ? `The username ${user} does not exist.`
          : "You must introduce the username who created this ad.",
      });
    }
    const ad = new Advertisement({
      ...adData,
      username: user.username,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const adCreated = await ad.save();

    res.status(201).json({
      id: adCreated.id,
      createdAt: adCreated.createdAt,
      updatedAt: adCreated.updatedAt,
      username: adCreated.username,
      name: adCreated.name,
      price: adCreated.price,
      sale: adCreated.sale,
      tags: adCreated.tags,
      photo: adCreated.photo ? pathImages + adCreated.photo : null,
    });

    // microservice that makes a thumbnail of the image
    requester.send(
      {
        type: "thumbnail",
        files: [req.file],
      },
      () => {
        console.log(`Finished resizing ${req.file.originalname}`);
      }
    );
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/adverts/:id (body)
// Update an ad
router.put("/:id", jwtAuth, async (req, res, next) => {
  try {
    const _id = req.params.id;
    const { username } = await User.findOne({
      [ID]: mongoose.Types.ObjectId(jwtReturnUser(req.headers.authorization)),
    });
    const ad = await Advertisement.findOne({
      [ID]: mongoose.Types.ObjectId(_id),
    });
    if (!(await User.checkAdBelongToUsername(username, ad))) {
      return res.status(403).json({
        [ERROR_CAUSE]:
          "You cannot update this ad because you are not the owner.",
      });
    }
    if (!ad) {
      return res.status(404).json({
        [ERROR_CAUSE]: "You cannot delete an ad that does not exist.",
      });
    }
    const adData = { ...req.body, updatedAt: Date.now() };
    if (adData.username) {
      return res.status(400).json({ [ERROR_CAUSE]: "Cannot update username" });
    }

    const adActualizado = await Advertisement.findOneAndUpdate(
      { [ID]: mongoose.Types.ObjectId(_id) },
      adData,
      {
        new: true,
        useFindAndModify: false,
      }
    );

    if (!adActualizado) {
      res.status(404).json({ [ERROR_CAUSE]: ERROR_NOT_FOUND });
      return;
    }

    res.json({ result: adActualizado });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/adverts/:id
// Delete an ad
router.delete("/:id", jwtAuth, async (req, res, next) => {
  try {
    const _id = req.params.id;
    const { id: userId, username } = await User.findOne({
      [ID]: mongoose.Types.ObjectId(jwtReturnUser(req.headers.authorization)),
    });

    const ad = await Advertisement.findOne({
      [ID]: mongoose.Types.ObjectId(_id),
    });
    if (!ad) {
      return res.status(404).json({
        [ERROR_CAUSE]: "You cannot delete an ad that does not exist.",
      });
    }

    if (!(await User.checkAdBelongToUsername(username, ad))) {
      return res.status(403).json({
        [ERROR_CAUSE]:
          "You cannot update this ad because you are not the owner.",
      });
    }

    await User.findByIdAndUpdate(userId, {
      $pull: { ads: mongoose.Types.ObjectId(_id) },
    });
    await Advertisement.deleteOne({ [ID]: mongoose.Types.ObjectId(_id) });

    res.status(204).json("Ad deleted correctly");
  } catch (error) {
    next(error);
  }
});

module.exports = router;
