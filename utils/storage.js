const AWS = require("aws-sdk");
const keys = require("../config/keys");

const s3bucket = new AWS.S3({
  accessKeyId: keys.aws.accessKeyId,
  secretAccessKey: keys.aws.secretAccessKey,
  region: keys.aws.region,
});

const cloudfront = new AWS.CloudFront({
  accessKeyId: keys.aws.accessKeyId,
  secretAccessKey: keys.aws.secretAccessKey,
  region: keys.aws.region,
});

exports.s3Upload = async (prefix, image) => {

  try {
    let imageUrl = "";
    let imageKey = "";

    if (!keys.aws.accessKeyId) {
      console.warn("Missing aws keys");
    }

    if (image) {
      const params = {
        Bucket: keys.aws.bucketName,
        Key: `${prefix}_${new Date().toISOString().replace(/[:.]/g, "-")}`,
        Body: image.buffer,
        ContentType: image.mimetype
      };

      const s3Upload = await s3bucket.upload(params).promise();

      imageKey = s3Upload.Key;
    }

    return { imageUrl, imageKey };
  } catch (error) {
    return { imageUrl: "", imageKey: "" };
  }
};

exports.s3Delete = async (key) => {
  try {
    const params = {
      Bucket: keys.aws.bucketName,
      Key: key,
    };
    await s3bucket.deleteObject(params).promise();
    return true;
  } catch (err) {
    return false;
  }
};

exports.s3Invalidate = async (key) => {
  try {
    const params = {
      DistributionId: keys.aws.distributionId,
      InvalidationBatch: {
        CallerReference: `${Date.now()}`, // must be unique
        Paths: {
          Quantity: 1,
          Items: [`/${key}`], // ✅ prepend slash here
        },
      },
    };
    await cloudfront.createInvalidation(params).promise();
    return true;
  } catch (err) {
    return false;
  }
};
