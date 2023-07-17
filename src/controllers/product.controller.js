const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const mongoose = require('mongoose');
const { productService } = require('../services');
const image = require('../services/image.service');
const Category = require('../models/category.model');
const Account = require('../models/account.model');
const Product = require('../models/product.model');
const Import = require('../models/import.model');
const Bill = require('../models/bill.model');
const axios = require('axios');
const config = require('../config/config');
const CateCtl = require('../controllers/category.controller');
const { responseSuccess, responseError } = require('../utils/responseType');
const { categoryController } = require('.');

const getAProduct = catchAsync(async (req, res, next) => {
  const _id = req.query._id;
  const code = req.query.code;
  // console.log("_id",_id,code)
  if (!_id && !code) return responseError({ res, statusCode: 400, message: config.message.err400 });
  Product.findOne({ $or: [{ _id: _id }, { code: code }] })
    .select('-comments')
    .exec((err, doc) => {
      if (err) return responseError({ res, statusCode: 500, message: config.message.err500 });
      if (!doc) return responseError({ res, statusCode: 400, message: config.message.err400 });
      responseSuccess({ res, message: config.message.success, data: doc });
    });
});

var categoryInfosTemp = {};
var categoryTempExist = false;
var categoryTemp = {};
var categorySurfacesTemp = [];
const RequestCategory = async () => {
  try {
    var list = await Category.find();
    // console.log(list)
    var temp = {};
    var infos = {};
    var surfaces = [];
    list.forEach((c) => {
      temp[c.name] = c;
      temp[c._id.toString()] = c;
      // @ts-ignore
      infos[c.name] = c.info;
      infos[c._id.toString()] = infos[c.name];
      // @ts-ignore
      // console.log(c.surface)
      surfaces.push(c.surface);
    });
    categoryTemp = temp;
    categoryInfosTemp = infos;
    categorySurfacesTemp = surfaces;
    categoryTempExist = true;

    return true;
  } catch (err) {
    console.log(err);
    categoryTempExist = false;
    return false;
  }
};

const ListColor = async (req, res, next) => {
  const list = await Product.find().select('colors');
  if (!!list) {
    const listColor = [];
    list.map((i) => {
      i.colors.map((e) => {
        if (!listColor.includes(e.color)) listColor.push(e.color);
      });
    });
    return responseSuccess({ res, message: config.message.success, data: listColor });
  } else return responseError({ res, statusCode: 500, message: config.message.err500 });
};

const List = async (req, res, next) => {
  try {
    const category = req.query.category;
    let specs = req.query.specs; // {name: value} "ram" : "1gb;2gb"
    const min_price = req.query.min_price || 0;
    const max_price = req.query.max_price || 1000000000;
    let colors = req.query.colors;
    const skip = Number(req.query.skip) || 0;
    const limit = Number(req.query.limit) || 10000;
    const search = req.query.search;
    const sortType = req.query.sortType;
    const sortName = req.query.sortName;
    var products;

    if (!!specs) {
      var temp = new Function('return [' + specs + '];')();
      specs = temp;
      const splitArr = {};
      specs.forEach((s) => {
        // @ts-ignore
        splitArr[s.name] = s.values.split(';').map((e) => e.trim());
      });
      specs = splitArr;
      console.log('specs', specs);
    }
    if (!!colors) colors = colors.split(';').map((e) => e.trim());
    if (!!category) {
      if (!categoryTempExist) await RequestCategory();
      const categoryDoc = !categoryTempExist ? await Category.findOne({ name: category }) : categoryTemp[category];
      if (!categoryDoc) return responseError({ res, statusCode: 500, message: config.message.err500 });
      products = categoryDoc.products;

      if (!!specs) {
        //query result
        for (let i = 0; i < categoryDoc.specsModel.length && products.length > 0; i++) {
          const e = categoryDoc.specsModel[i];
          const specsProduct = [];

          if (specs.hasOwnProperty(e.name)) {
            const values = specs[e.name];
            console.log('name', e.name);
            console.log('values', values);

            for (let j = 0; j < e.values.length; j++) {
              if (values.includes(e.values[j].value)) {
                console.log('valueTest', e.values[j].value);
                e.values[j].products.forEach((id) => specsProduct.push(id.toString()));
              }
            }
            products = products.filter((id) => specsProduct.includes(id.toString()));
          }
        }
      }

      if (products.length == 0)
        if (req.query.skip == undefined)
          return responseSuccess({ res, message: config.message.success, data: { products: [], count: 0 } });
        else return responseSuccess({ res, message: config.message.success, data: { products: [] } });
    }

    const queryOptions = { price: { $lte: max_price, $gte: min_price } };
    if (!!search) {
      const pattern = { $regex: '.*' + search + '.*', $options: 'i' };
      queryOptions['$or'] = [{ name: pattern }, { code: pattern }, { category: pattern }];
    }
    if (!!products) queryOptions['_id'] = { $in: products };
    if (!!colors) queryOptions['colors.color'] = { $in: colors };
    const sortOptions = {};

    if (!!sortName && ['price', 'sale', 'sold', 'total_rate'].includes(sortName) && (sortType == 1 || sortType == -1)) {
      sortOptions[sortName] = sortType;
    }

    const count = await Product.countDocuments(queryOptions);
    console.log(count);
    Product.find(queryOptions)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean()
      .select(config.product_str)
      .exec((err, docs) => {
        if (err) return responseError({ res, statusCode: 500, message: config.message.errInternal });
        return responseSuccess({ res, message: config.message.success, data: { data: docs, count } });
      });
  } catch (err) {
    console.log(err);
    return responseError({ res, statusCode: 500, message: config.message.err500 });
  }
};

const Top = async (req, res) => {
  const category = req.query.category;
  const quantity = Number(req.query.quantity) || 10;

  var query = { 'colors.0': { $exists: true }, enable: true };
  if (!!category) query.category = category;

  Product.find(query)
    .sort({ sold: -1 })
    .limit(quantity)
    .select(config.message.product_str)
    .exec((err, docs) => {
      if (err) return res.status(500).send({ msg: config.message.err500 });
      return res.send({ msg: config.message.success, data: docs });
    });
};

const createProduct = catchAsync(async (req, res, next) => {
  const name = req.body.name;
  const code = req.body.code;
  const desc = req.body.desc;
  const category = req.body.category;
  let specs = req.body.specs;
  const price = req.body.price;
  const sale = req.body.sale;
  const image_base64 = req.body.image_base64;

  // Handle Required Data
  const error = '';
  if (!name) error += config.message.errMissField + '[name]. ';
  if (!code) error += config.message.errMissField + '[code]. ';
  if (!category) error += config.message.errMissField + '[category]. ';
  if (!specs) error += config.message.errMissField + '[specs]. ';
  if (!price) error += config.message.errMissField + '[price]. ';
  if (!image_base64) error += config.message.errMissField + '[image_base64]. ';
  if (!!error) responseError({ res, statusCode: 400, message: error });

  const img_info = await image.upload(image.base64(image_base64), 'product_image');
  if (!img_info)
    return responseError({ res, statusCode: 500, message: config.message.errWrongField + '[image_base64]. ' });

  // Handle Category & Specs
  let categoryDoc = await Category.findOne({ name: category });

  if (!categoryDoc) return responseError({ res, statusCode: 400, message: config.message.err400 });

  specs = CateCtl.ValidSpecs(categoryDoc, specs);

  if (Object.keys(specs).length == 0) return responseError({ res, statusCode: 400, message: config.message.err400 });

  // const product = new Product({ name, code, desc, price, sale });
  const product = new Product({
    name,
    code,
    desc,
    category,
    specs,
    price,
    sale,
    image_id: img_info.public_id,
    image_url: img_info.url
  });
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const opts = { session };
    const productDoc = await product.save(opts);
    // @ts-ignore
    categoryDoc.addProduct(productDoc);
    categoryDoc = await categoryDoc.save();
    if (!productDoc || !categoryDoc) throw Error('Fail');

    await session.commitTransaction();
    session.endSession();
    RequestCategory();
    responseSuccess({ res, message: config.message.success });
  } catch (error) {
    console.log(error);
    image.destroy(img_info.public_id);
    await session.abortTransaction();
    session.endSession();
    return responseError({ res, statusCode: 500, message: 'Lỗi không lưu đồng bộ với category' });
  }
});
const Update = async (req, res, next) => {
  try {
    const _id = req.body._id;
    const code = req.body.code;
    const name = req.body.name;
    const desc = req.body.desc;
    const price = req.body.price;
    const enable = req.body.enable;
    const specs = req.body.specs;
    const sale = req.body.sale;
    const image_base64 = req.body.image_base64;

    // Get product
    if (!_id && !code) return responseError({ res, statusCode: 400, message: config.err400 });

    let product = await Product.findOne({ $or: [{ _id: _id }, { code: code }] }).select('-comments');

    if (!product) return responseError({ res, statusCode: 500, message: config.err500 });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const opts = { session };

      enable != undefined ? (product.enable = enable) : (product.enable = product.enable);
      product.name = name || product.name;
      product.desc = desc || product.desc;
      product.price = price || product.price;
      product.sale = sale || product.sale;

      let category;
      if (!!specs) {
        category = await Category.findOne({ name: product.category });
        if (!category) return responseError({ res, statusCode: 500, message: config.err500 });
        // @ts-ignore
        category.delProduct(product);
        product.specs = CateCtl.ValidSpecs(category, specs);
        // @ts-ignore
        category.addProduct(product);
      }

      let img_info;
      const old_image_id = product.image_id;
      if (!!image_base64) {
        img_info = await image.upload(image.base64(image_base64), 'product_color');
        if (!img_info) return responseError({ res, statusCode: 500, message: config.errSaveImage });
        product.image_id = img_info.public_id;
        product.image_url = img_info.url;
      }

      // Save
      const productDoc = await product.save(opts);
      const categeryDoc = !!category ? await category.save(opts) : 'temp';
      if (!productDoc || !categeryDoc) {
        if (!!img_info) image.destroy(img_info.public_id);
        throw Error();
      } else {
        if (!!img_info) image.destroy(old_image_id);
        await session.commitTransaction();
        session.endSession();
        RequestCategory();
        responseSuccess({ res, message: config.message.success });
      }
    } catch (error) {
      console.log(error);
      await session.abortTransaction();
      session.endSession();
      responseError({ res, statusCode: 500, message: 'Lỗi không lưu đồng bộ với category' });
    }
  } catch (err) {
    console.log(err);
    responseError({ res, statusCode: 500, message: config.err500 });
  }
};

const Rate = async (req, res, next) => {
  try {
    const _id = req.body._id;
    const account = req.user;
    const rate = req.body.rate || 0;
    const message = req.body.message || '';

    if (!rate || rate > 5 || rate < 0) return responseError({ res, statusCode: 400, message: config.message.err400 }); // res.status(400).send({ msg: config.message.err400 });

    // @ts-ignore
    const rate_waits = (await Account.findById(account._id).select('rate_waits').exec()).rate_waits;
    // @ts-ignore
    if (!rate_waits.includes(_id))
      return res.status(400).send({ msg: 'Để có thể đánh giá, bạn cần phải mua sản phẩm này trước. ' });

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const opts = { session };

      if (!(await Account.findByIdAndUpdate(account._id, { $pull: { rate_waits: { _id } } }, opts).exec()))
        throw Error('Fail to save Account');

      const doc = await Product.findById(_id).select('total_rate comments').exec();
      // @ts-ignore
      const total_rate = (doc.total_rate * doc.comments.length + rate) / (doc.comments.length + 1);

      if (
        !(await Product.findByIdAndUpdate(
          _id,
          { total_rate, $push: { comments: { account: account._id,name: account.name || 'Ẩn danh', message, rate } } },
          opts
        ).exec())
      )
        throw Error('Fail to save Product');

      await session.commitTransaction();
      session.endSession();
      return responseSuccess({ res, message: config.message.success });
    } catch (error) {
      console.log("err",error)
      await session.abortTransaction();
      session.endSession();
      return responseError({ res, statusCode: 400, message: 'Lỗi không đồng bộ Account và Product' }); //res.status(400).send({ msg: 'Lỗi không đồng bộ Account và Product' });
    }
  } catch (err) {
    console.log(err);
    return responseError({ res, message: config.message.err500 }); // res.status(500).send({ msg: config.message.err500 });
  }
};

const ValidCart = async (req, res, next) => {
  try {
    let cart = req.body.cart;
    const account = req.user;

    if (!cart && account) cart = account.cart;
    if (!cart) return responseError({ res, statusCode: 400, message: config.message.err400 });
    // console.log("1",cart)
    const newCart = [];
    const cartItems = [];
    let warning = '';
    let count = 0;
    for (let i = 0; i < cart.length; i++) {
      let unit = cart[i];
      if (unit.quantity == 0) continue;
      const doc = await Product.findById(unit.product).select('code name price sale colors category enable').exec();
      console.log('product', doc);
      if (!doc) {
        warning += `Sản phẩm ${unit.product} không tồn tại. `;
        continue;
      }
      if (!doc.enable) {
        warning += `Sản phẩm ${doc.name} ${unit.color} không thể mua vào lúc này. `;
        continue;
      }

      let colorIndex = doc.colors.findIndex((e) => e.color == unit.color);
      if (colorIndex == -1) {
        warning += `Sản phẩm ${doc.name} không có màu ${unit.color}. `;
        continue;
      }

      const doc_color = doc.colors[colorIndex];
      // console.log("doc_color")
      if (doc_color.quantity < unit.quantity) {
        warning += `Sản phẩm ${doc.name} ${unit.color} không đủ số lượng, chỉ có ${doc_color.quantity}. `;
        // refresh quantity
        unit.quantity = doc_color.quantity;
      }
      if (doc_color.quantity == 0) continue;
      newCart.push(unit);
      cartItems.push({
        product: doc._id,
        name: doc.name,
        code: doc.code,
        category: doc.category,
        price: doc.price,
        sale: doc.sale,
        color: unit.color,
        colorIndex,
        image_url: doc_color.image_url,
        quantity: unit.quantity
      });
      count += unit.quantity;
    }
    req.body.cart = newCart;
    req.body.cartItems = cartItems;
    req.body.warning = warning;
    req.body.count = count;
    next();
  } catch (err) {
    console.log(err);
    return responseError({ res, statusCode: 400, message: config.message.err400 });
  }
};

const Imports = async (req, res, next) => {
  const data = req.body.data; // [{code, quantity, color, price}]
  if (!data) return res.status(400).send({ msg: config.message.err400 });

  if (data.length == 0) return res.send({ msg: 'Rỗng' });

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const opts = { session };

    const success = [];
    const failure = [];
    for (let i = 0; i < data.length; i++) {
      const { code, color, quantity, price } = data[i];
      // console.log("data",data[i])
      const doc = await Product.findOne({ code }).select('colors').exec();
      
      if (!doc) failure.push({ code, quantity, price: Number(price) });
      else {
        var flag = false;
        for (let colordoc of doc.colors) {
          if (colordoc.color == color) {
            colordoc.quantity += quantity;
            // console.log("colordoc",colordoc)
            // console.log("quantity",quantity)
            // console.log("data[i]",data[i])
            flag = true;
            break;
          }
        }
        if (flag && !!(await doc.save(opts))) success.push({ product: doc._id, quantity, price, color });
        else failure.push(data[i]);
      }
    }

    const importBill = new Import({ products: success, admin: req.user._id });
    if (!(await importBill.save())) throw Error('Không thể lưu import bill');

    await session.commitTransaction();
    session.endSession();
    return res.send({ msg: config.message.success, failure });
  } catch (error) {
    console.log(error);
    await session.abortTransaction();
    session.endSession();
    return res.status(500).send({ msg: 'Lỗi không thể lưu import bill' });
  }
};

const ReadComments = async (req, res, next) => {
  const _id = req.query._id;
  const code = req.query.code;
  const skip = req.query.skip || 0;
  const limit = req.query.skip || 10000;

  Product.findOne({ $or: [{ _id: _id }, { code: code }] })
    .select('comments')
    .slice('comments', [skip, limit])
    .populate('comments.account')
    .exec((err, doc) => {
      if (err) return res.status(500).send({ msg: config.message.err500 });
      if (!doc) return res.status(400).send({ msg: config.message.errNotExists });
      const edit_result = [];
      for (let i = 0; i < doc.comments.length; i++) {
        const e = doc.comments[i];
        // @ts-ignore
        edit_result.push({
          account: e.account.name || e.account.email || e.account.phone,
          message: e.message,
          rate: e.rate,
          at: e.at
        });
      }
      return res.send({ msg: config.message.success, data: edit_result });
    });
};
const Sale = async (req, res) => {
  const category = req.query.category;
  const quantity = Number(req.query.quantity) || 10;

  const query = { 'colors.0': { $exists: true }, enable: true, 'catalogue.0': { $exists: true } };
  if (!!category) query.category = category;

  Product.find(query)
    .sort({ sale: -1 })
    .limit(quantity)
    .select('catalogue category name')
    .exec((err, docs) => {
      if (err) return responseError({ res, statusCode: 500, message: config.message.err500 });
      const clone = JSON.parse(JSON.stringify(docs));
      clone.forEach((d) => {
        d.image_url = d.catalogue[0].image_url;
        delete d.catalogue;
      });
      responseSuccess({ res, message: config.message.success, data: { data: clone } });
    });
};

const UpdateColor = async (req, res, next) => {
  const _id = req.body._id;
  const code = req.body.code;
  const color = req.body.color;
  const image_base64 = req.body.image_base64;

  if ((!_id && !code) || !color) return res.status(400).send({ msg: config.message.err400 });

  var doc = await Product.findOne({ $or: [{ _id: _id }, { code: code }] })
    .select('colors')
    .exec();
  if (!doc) return res.status(400).send({ msg: config.message.err400 });

  for (let i = 0; i < doc.colors.length; i++) {
    if (doc.colors[i].color == color) {
      const img_info = await image.upload(image.base64(image_base64), 'product_color');
      if (!img_info) return res.status(500).send({ msg: config.message.errSaveImage });
      const old_image_id = doc.colors[i].image_id;
      doc.colors[i].image_id = img_info.public_id;
      doc.colors[i].image_url = img_info.url;
      if (!!(await doc.save())) {
        image.destroy(old_image_id);
        return res.send({ msg: config.message.success });
      } else {
        image.destroy(img_info.public_id);
        return res.status(500).send({ msg: config.message.err500 });
      }
    }
  }
  return res.status(400).send({ msg: mess.errWrongField + '[color]. ' });
};
const AddColor = async (req, res, next) => {
  const _id = req.body._id;
  const code = req.body.code;
  const image_base64 = req.body.image_base64;
  const color = req.body.color;

  if ((!_id && !code) || !image_base64 || !color) return res.status(400).send({ msg: config.message.err400 });

  const img_info = await image.upload(image.base64(image_base64), 'product_color');
  if (!img_info) return res.status(500).send({ msg: config.message.errSaveImage });
  const color_save = { color: color, image_id: img_info.public_id, image_url: img_info.url };

  Product.findOneAndUpdate({ $or: [{ _id: _id }, { code: code }] }, { $push: { colors: color_save } }).exec(
    (err, doc) => {
      if (err) return res.status(500).send({ msg: config.message.err500 });
      if (!doc) return res.status(400).send({ msg: config.message.errNotExists });

      return res.send({ msg: config.message.success, data: color_save });
    }
  );
};
const Hint = async (req, res) => {
  var products = req.body.products; // _id list
  const quantity = Number(req.body.quantity) || 5;
  const account = req.user;

  try {
    if (!products) {
      if (!!account) {
        var accountDoc = await Account.findById(account._id).populate('bills', 'products').select('bills').exec();
        if (!accountDoc) throw Error();
        // @ts-ignore
        var bills = accountDoc.bills;
        var productsSet = new Set();
        bills.products.forEach((e) => productsSet.add(e.product.toString()));
        products = Array.from(productsSet);
      } else throw Error();
    }

    const data = {
      data: products,
      quantity: quantity
    };
    var results = await axios.post(process.env.HINT_URL, data, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (results.data.success == 'Fail' || !results.data) throw Error();
    Product.find({ _id: { $in: results.data.reverse() }, 'colors.0': { $exists: true }, enable: true })
      .select(config.product_str)
      .exec((err, docs) => {
        if (err) return res.status(500).send({ msg: config.message.err500 });
        var rs = [];
        results.data.forEach((_id) => {
          for (var i = 0; i < docs.length; i++) {
            if (docs[i]._id == _id) {
              rs.push(docs[i]);
              break;
            }
          }
        });
        return res.send({ msg: config.message.success, data: rs });
      });
  } catch (err) {
    console.log('Cannot get from hint server');
    const docs = await Bill.find({ products: { $elemMatch: { product: { $in: products } } } })
      .populate('products')
      .select('products')
      .exec();
    if (!docs) return res.status(500).send({ msg: config.message.err500 });

    if (docs.length > 0) {
      const counter = {};
      docs.forEach((b) =>
        b.products.forEach((p) => {
          var key = p.product.toString();
          if (counter.hasOwnProperty(key)) {
            counter[key] += 1;
          } else {
            counter[key] = 1;
          }
        })
      );
      const keys = Object.keys(counter)
        .sort((a, b) => -counter[a] + counter[b])
        .slice(0, quantity);
      Product.find({ _id: { $in: keys }, 'colors.0': { $exists: true }, enable: true })
        .select(config.product_str)
        .limit(quantity)
        .exec((err, docs) => {
          if (err) return res.status(500).send({ msg: config.message.err500 });
          var rs = [];
          keys.forEach((_id) => {
            for (var i = 0; i < docs.length; i++) {
              if (docs[i]._id == _id) {
                rs.push(docs[i]);
                break;
              }
            }
          });
          return res.send({ msg: config.message.success, data: rs });
        });
    } else {
      Product.find({ 'colors.0': { $exists: true }, enable: true })
        .sort({ sold: -1 })
        .select(config.product_str)
        .limit(quantity)
        .exec((err, docs) => {
          if (err) return res.status(500).send({ msg: config.message.err500 });
          return res.send({ msg: config.message.success, data: docs });
        });
    }
  }
};

const CommingSoon = async (req, res, next) => {
  try {
    const category = req.body.category;
    const skip = req.body.skip || 0;
    const limit = req.body.limit || 10000;

    var pipeline = [
      {
        $project: {
          name: '$name',
          code: '$code',
          image_url: '$image_url',
          price: '$price',
          sale: '$sale',
          total_rate: '$total_rate',
          enable: '$enable',
          sold: '$sold',
          colors: '$colors',
          category: '$category',
          colors_length: { $size: '$colors' }
        }
      },
      {
        $match: {
          colors_length: 0,
          enable: true
        }
      },
      { $skip: skip },
      { $limit: limit }
    ];

    if (!!category) pipeline[1]['$match']['category'] = category;

    Product.aggregate(pipeline).exec((err, docs) => {
      if (!!err) return res.status(500).send({ msg: mess.errInternal });
      return res.send({ msg: mess.success, data: docs });
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send({ msg: config.err500 });
  }
};

// const deleteCategory = catchAsync(async (req, res, next) => {
//   await categoryService.deleteCategoryBySlug(req.params.slug);
// });
module.exports = {
  CommingSoon,
  createProduct,
  getAProduct,
  ListColor,
  List,
  Update,
  ValidCart,
  Sale,
  AddColor,
  UpdateColor,
  Imports,
  Top,
  Rate,
  ReadComments,
  Hint
};