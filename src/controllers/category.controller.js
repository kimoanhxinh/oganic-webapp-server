const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const config = require('../config/config');
const { categoryService } = require('../services');
const mongoose = require('mongoose');
const Product = require('../models/product.model')
const Category = require('../models/category.model')
const image = require('../services/image.service');
const { responseError, responseSuccess } = require('../utils/responseType');



var categoryInfosTemp = {};
var categoryTempExist = false;
var categoryTemp = {};
var categorySurfacesTemp = [];
const RequestCategory = async () => {
  try {
      var list = await Category.find();
      console.log(list)
      var temp = {}
      var infos = {}
      var surfaces = []
      list.forEach((c) => {
          temp[c.name] = c
          temp[c._id.toString()] = c
          // @ts-ignore
          infos[c.name] = c.info
          infos[c._id.toString()] = infos[c.name]
          // @ts-ignore
          console.log(c.surface)
          surfaces.push(c.surface)
      });
      categoryTemp = temp;
      categoryInfosTemp = infos;
      categorySurfacesTemp = surfaces;
      categoryTempExist = true
    
      return true;
  } catch (err) {
      console.log(err)
      categoryTempExist = false
      return false
  }
}
const List = catchAsync(async (req, res, next) => {
  try {
    const list = await Category.find();
    const arr = []
    list.forEach((c) => {
      console.log(c.surface)
      arr.push(c.surface)
  });
    return res.send({ msg: config.message.success, data: arr })
  } catch (err) {
    console.log(err)
    return res.status(500).send({ msg: config.message.err500 })
  }
});


const getACategory = catchAsync(async (req, res, next) => {
  try {
    const name = req.query.name;
    const _id = req.query._id;

    if(!categoryTempExist) await RequestCategory()
    if(!categoryTempExist) throw Error()
    
    if(!!name && categoryInfosTemp.hasOwnProperty(name)){
        return res.send({ msg: config.message.success, data: categoryInfosTemp[name] })
    } 
    if(!!_id && categoryInfosTemp.hasOwnProperty(_id)){
        return res.send({ msg: config.message.success, data: categoryInfosTemp[_id] })
    } 
    return res.status(400).send({msg: config.message.errMissField + "[_id/name]. "})
    
} catch (err) {
    console.log(err)
    return res.status(500).send({ msg: config.message.err500 })
}
});

const ValidSpecs = function (category, specs) {
  var new_specs = {};
  for (let i = 0; i < category.specsModel.length; i++) {
    var e = category.specsModel[i];
    if (specs.hasOwnProperty(e.name)) {
      for (let j = 0; j < e.values.length; j++) {
        if (specs[e.name] == e.values[j].value) {
          new_specs[e.name] = e.values[j].value;
          break;
        }
      }
    }
  }
  return new_specs;
};
const createCategory = catchAsync(async (req, res, next) => {
  try {
    const name = req.body.name;
    const slug = req.body.slug;
    const image_base64 = req.body.image_base64;
    const icon_base64 = req.body.icon_base64;
    const specsModel = req.body.specsModel; // [{name: "Ram", values: [{value: "2gb"}, {value: "4gb"}]}]
    // @ts-ignore
    if (!slug || !name || !image_base64 || !specsModel || !Category.checkSpecsModel(specsModel))
      return responseError({ res, statusCode: 400, message: config.message.err400 });

    var img_info = await image.upload(image.base64(image_base64), 'category');
    var icon_info = await image.upload(image.base64(icon_base64), 'category');
    if (!img_info) return responseError({ res, statusCode: 500, message: config.message.errSaveImage });

    // Try to save category
    const category = new Category({
      name: name,
      specsModel: specsModel,
      image_id: img_info.public_id,
      image_url: img_info.url,
      icon_id: icon_info.public_id,
      icon_url: icon_info.url,
      slug: slug
    });
    category.save((err, doc) => {
      if (err) return responseError({ res, statusCode: 500, message: config.message.err500 });
      if (!doc) return responseError({ res, statusCode: 400, message: config.message.err400 });
      RequestCategory();
      return responseSuccess({ res, message: config.message.success });
    });
  } catch (err) {
    console.log(err);
    return responseError({ res, statusCode: 500, message: config.message.err500 });
  }
  // const category = await categoryService.createCategory(req.body);
  // res.status(httpStatus.CREATED).send({
  //   status: 'success',
  //   data: category
  // });
});

const Delete = async (req, res, next) => {
  try {
      const name = req.body.name;
      const _id = req.body._id;
      if (!name && !_id)
          return res.status(400).send({ msg: config.message.err400 })

      const category = await Category.findOne({ $or: [{ '_id': _id }, { 'name': name }] })
      if (!category)
          return res.status(400).send({ msg: config.message.errNotExists })
      if (category.products.length > 0) {
          return res.send({ msg: config.message.failure, reason: `Category relate ${category.products.length} products` })
      }
      category.deleteOne((err) => {
          if (err)
              return res.status(500).send({ msg: config.message.err500 })
          image.destroy(category.image_id)
          return res.send({ msg: config.message.success })
      })
  } catch (err) {
      console.log(err)
      return res.status(500).send({ msg: config.message.err500 })
  }
}

const specsModelMerge = (specsModel, newSpecsInput) => {
  const valuesId_2d = [];
  specsModel.forEach((spec) => {
    const temp = [];
    // @ts-ignore
    spec.values.forEach((value) => {
      temp.push(value._id);
    });
    valuesId_2d.push(temp);
  });

  const result = [];
  // console.log("newspecs",newSpecsInput)
  // console.log("specs",specsModel)
  newSpecsInput.forEach((spec, i) => {
    if (!spec.name) return; // delete spec
    var temp;
    if (specsModel[i] == undefined || specsModel[i]._id == undefined) temp = { name: spec.name, values: [] };
    else temp = { _id: specsModel[i]._id, name: spec.name, values: [] };
    // @ts-ignore
    spec.values.split(';').forEach((value, j) => {
      if (!value) return; // delete value
      var id = valuesId_2d.length > i ? (valuesId_2d[i].length > j ? valuesId_2d[i][j] : undefined) : undefined;
      if (id == undefined) temp.values.push({ value: value });
      else temp.values.push({ _id: id, value: value });
    });
    result.push(temp);
  });
  console.log("result",result)
  return result;
};
const updateCategory = catchAsync(async (req, res, next) => {
  try {
    const _id = req.body._id;
    const name = req.body.name;
    const image_base64 = req.body.image_base64;
    const icon_base64 = req.body.icon_base64;
    var specsModel = req.body.specsModel;

    if (!_id || (!name && !image_base64 && !specsModel && !icon_base64))
        return res.status(400).send({ msg: config.message.err400 })

    var category = await Category.findById(_id);
    if (!category)
        return res.status(400).send({ msg: config.message.err400 })

    var msg = ""
    var old_image_id = category.image_id
    var img_info;
 
    if (!!image_base64) {
        img_info = await image.upload(image.base64(image_base64), "category")
        if (img_info) {
            category.image_id = img_info.public_id
            category.image_url = img_info.url
            var categoryDoc = await category.save()
            if (!categoryDoc) {
                image.destroy(img_info.public_id)
                msg += "Lưu ảnh thất bại. "
            } else {
                image.destroy(old_image_id)
                msg += "Lưu ảnh thành công. "
            }
        }
    }
    var old_icon_id = category.icon_id
    var icon_info;
    if (!!icon_base64) {
      icon_info = await image.upload(image.base64(icon_base64), "category")
        if (icon_info) {
            category.icon_id = icon_info.public_id
            category.icon_url = icon_info.url
            var categoryDoc = await category.save()
            if (!categoryDoc) {
                image.destroy(icon_info.public_id)
                msg += "Lưu icon thất bại. "
            } else {
                image.destroy(old_icon_id)
                msg += "Lưu icon thành công. "
            }
        }
    }

    if (!!specsModel || !!name) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const opts = { session };
            specsModel = specsModelMerge(category.specsModel, specsModel)

            if((!!name && !(await Category.findOne({ _id: { $ne: _id }, name }))))
            {
                category.name = name
                for(let  i = 0; i < category.products.length; i++) {
                    if(!(await Product.findByIdAndUpdate(category.products[i], {"category": name}, opts).exec())) {
                        console.log(category.products[i])
                        throw Error()
                    }
                }
            }
            if(!!specsModel) {
                console.log("Save")
                // @ts-ignore
                await category.saveSpecsModel(specsModel, opts)
            } else {
                if(!(await category.save(opts)))
                    throw Error()
            }
            await session.commitTransaction();
            session.endSession();
            res.send({msg: config.message.success})
            RequestCategory()
        } catch (error) {
            console.log(error)
            await session.abortTransaction();
            session.endSession();
            return res.status(500).send({ msg: "Lỗi không lưu đồng bộ với category" })
        }
    }
} catch (err) {
    console.log(err)
    return res.status(500).send({ msg: config.message.err500 })
}
});
const deleteCategory = catchAsync(async (req, res, next) => {
  await categoryService.deleteCategoryBySlug(req.params.slug);
  responseSuccess({ res, statusCode: httpStatus.NO_CONTENT });
});
module.exports = {
  createCategory,
  getACategory,
  deleteCategory,
  updateCategory,
  ValidSpecs,
  List,
  Delete
};
